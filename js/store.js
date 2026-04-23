// ============================================
// CINEVERSE – Shared Video Store
// Metadata → localStorage. Uploaded video blobs → IndexedDB.
// External hosts (YouTube / Drive / Dropbox / direct mp4) → URL only.
// ============================================
(function (global) {
  'use strict';

  const KEY = 'cineverse_videos_v1';
  const ADMIN_KEY = 'cineverse_admin_session';
  const ADMIN_PASSWORD = 'admin123'; // change anytime

  const USERS_KEY = 'cineverse_users_v1';
  const USER_SESSION_KEY = 'cineverse_user_session_v1';
  const RATINGS_KEY = 'cineverse_ratings_v1';
  const COMMENTS_KEY = 'cineverse_comments_v1';

  const IDB_NAME = 'cineverse';
  const IDB_STORE = 'blobs';
  const IDB_VER = 1;

  // ---------- user auth ----------
  async function hashPassword(pw) {
    const s = String(pw || '');
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      try {
        const data = new TextEncoder().encode(s);
        const buf  = await global.crypto.subtle.digest('SHA-256', data);
        return 'sha256:' + Array.from(new Uint8Array(buf))
          .map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (_) { /* fall through */ }
    }
    // Fallback: djb2 (not cryptographic, but not plaintext either)
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return 'djb2:' + (h >>> 0).toString(16);
  }
  function readUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch (_) { return []; }
  }
  function writeUsers(list) {
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
  }
  function toSession(u) {
    return { id: u.id, name: u.name, email: u.email, plan: u.plan, createdAt: u.createdAt };
  }

  // ---------- localStorage (metadata) ----------
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  // ---------- IndexedDB (blob storage) ----------
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbPut(id, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('aborted'));
    });
  }
  async function idbGet(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbQuota() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    } catch (_) { return null; }
  }

  // ---------- URL normalization ----------
  // Turn share links into something that actually plays in a <video> or <iframe>.
  function normalizeUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return { src: '', type: 'url' };

    // YouTube: watch, short, embed → embed
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (yt) return { src: 'https://www.youtube.com/embed/' + yt[1], type: 'youtube' };

    // Vimeo: vimeo.com/ID → player.vimeo.com/video/ID
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return { src: 'https://player.vimeo.com/video/' + vm[1], type: 'iframe' };

    // Google Drive: /file/d/ID/view → preview iframe (works for any size, incl. 10GB+)
    const gd = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]{10,})/);
    if (gd) return { src: 'https://drive.google.com/file/d/' + gd[1] + '/preview', type: 'iframe' };

    // Dropbox share link → direct download (dl=1 forces raw file)
    if (/dropbox\.com\/s\//.test(url)) {
      const fixed = url.replace(/[?&]dl=\d/, '').replace(/\?.*$/, '') + '?dl=1';
      return { src: fixed.replace('www.dropbox.com', 'dl.dropboxusercontent.com'), type: 'url' };
    }

    // OneDrive share → embed
    if (/1drv\.ms|onedrive\.live\.com/.test(url)) {
      return { src: url.replace('/redir?', '/embed?').replace('?e=', '&e='), type: 'iframe' };
    }

    // Already an embed or direct mp4/webm/mov
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url)) return { src: url, type: 'url' };
    if (/\/embed\//.test(url) || /player\./.test(url)) return { src: url, type: 'iframe' };

    // Fallback: treat as direct URL and let the <video> tag try
    return { src: url, type: 'url' };
  }

  // ---------- Store API ----------
  const Store = {
    PASSWORD: ADMIN_PASSWORD,

    getAll() { return read(); },

    getByCategory(cat) {
      return read().filter(v => (v.category || '').toLowerCase() === cat.toLowerCase());
    },

    getById(id) {
      const list = read();
      const key = String(id);
      // Direct match (current id) first, then alias fallback for old
      // pre-migration ids (e.g. `u1776648384601`) that may still be
      // cached in already-rendered cards or bookmarked URLs.
      return list.find(v => String(v.id) === key)
          || list.find(v => Array.isArray(v._prevIds) && v._prevIds.map(String).includes(key));
    },

    // Save metadata only. videoSrc for idb entries is empty — resolve with getPlayableSrc.
    add(video) {
      const list = read();
      if (!video.id) video.id = 'u' + Date.now();
      video.createdAt = new Date().toISOString();
      // Only the newest upload should carry the "NEW" badge.
      if (video.badge === 'NEW') {
        list.forEach(v => { if (v.badge === 'NEW') v.badge = null; });
      }
      list.unshift(video);
      return write(list) ? video : null;
    },

    // Merge a patch onto an existing video. Preserves id/createdAt.
    // If badge transitions to 'NEW', strips 'NEW' from the other videos.
    update(id, patch) {
      const list = read();
      const idx = list.findIndex(v => String(v.id) === String(id));
      if (idx < 0) return null;
      const prev = list[idx];
      const next = { ...prev, ...patch, id: prev.id, createdAt: prev.createdAt };
      if (next.badge === 'NEW' && prev.badge !== 'NEW') {
        list.forEach((v, i) => { if (i !== idx && v.badge === 'NEW') v.badge = null; });
      }
      list[idx] = next;
      return write(list) ? next : null;
    },

    async remove(id) {
      const list = read().filter(v => String(v.id) !== String(id));
      write(list);
      try { await idbDelete(id); } catch (_) {}
      return true;
    },

    // One-shot migration: rename opaque `u<digits>` ids to slug form derived
    // from the video title, and update every cross-reference
    // (ratings, comments, progress, favorites, IndexedDB).
    async migrateIdsToSlugs() {
      const list = read();
      const slugify = (t) => String(t || '')
        .toLowerCase().trim()
        .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 60);

      const used = new Set(list.map(v => String(v.id)));
      const renames = []; // [{oldId, newId, sourceType}]

      for (const v of list) {
        if (!/^u\d+$/.test(String(v.id))) continue; // already slug
        const base = slugify(v.title) || 'video';
        let candidate = base, n = 2;
        while (used.has(candidate)) {
          candidate = base + '-' + n++;
          if (n > 100) { candidate = base + '-' + Math.random().toString(36).slice(2, 6); break; }
        }
        used.delete(String(v.id));
        used.add(candidate);
        const oldId = String(v.id);
        renames.push({ oldId, newId: candidate, sourceType: v.sourceType });
        v._prevIds = Array.isArray(v._prevIds) ? v._prevIds.concat(oldId) : [oldId];
        v.id = candidate;
      }

      if (!renames.length) return { migrated: 0 };

      // Rekey ratings + comments
      const ratings = this._readRatings();
      const comments = this._readComments();
      renames.forEach(({ oldId, newId }) => {
        if (ratings[oldId])  { ratings[newId]  = ratings[oldId];  delete ratings[oldId];  }
        if (comments[oldId]) { comments[newId] = comments[oldId]; delete comments[oldId]; }
      });
      this._writeRatings(ratings);
      this._writeComments(comments);

      // Rekey progress
      try {
        const prog = JSON.parse(localStorage.getItem('cineverse_progress_v1')) || {};
        let changed = false;
        renames.forEach(({ oldId, newId }) => {
          if (prog[oldId]) { prog[newId] = prog[oldId]; delete prog[oldId]; changed = true; }
        });
        if (changed) localStorage.setItem('cineverse_progress_v1', JSON.stringify(prog));
      } catch (_) {}

      // Rekey faves for every user
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith('cineverse_faves_')) continue;
          let arr;
          try { arr = JSON.parse(localStorage.getItem(k)) || []; } catch (_) { continue; }
          let changed = false;
          const map = new Map(renames.map(r => [r.oldId, r.newId]));
          arr = arr.map(id => { if (map.has(id)) { changed = true; return map.get(id); } return id; });
          if (changed) localStorage.setItem(k, JSON.stringify(arr));
        }
      } catch (_) {}

      // Rekey IndexedDB blobs (only for sourceType === 'idb')
      for (const { oldId, newId, sourceType } of renames) {
        if (sourceType !== 'idb') continue;
        try {
          const blob = await idbGet(oldId);
          if (blob) { await idbPut(newId, blob); await idbDelete(oldId); }
        } catch (_) {}
      }

      write(list);
      return { migrated: renames.length, renames };
    },

    clear() {
      localStorage.removeItem(KEY);
    },

    // ---- blob storage ----
    async saveBlob(id, blob) { return idbPut(id, blob); },
    async loadBlob(id)       { return idbGet(id); },
    async quota()            { return idbQuota(); },

    // Resolve a video record to a playable src + how to render it.
    // Returns { src, type: 'url'|'youtube'|'iframe', revoke?: fn }
    async getPlayableSrc(video) {
      if (!video) return { src: '', type: 'url' };
      if (video.sourceType === 'idb') {
        const blob = await idbGet(video.id);
        if (!blob) return { src: '', type: 'url', missing: true };
        const url = URL.createObjectURL(blob);
        return { src: url, type: 'url', revoke: () => URL.revokeObjectURL(url) };
      }
      if (video.sourceType === 'youtube') return { src: video.videoSrc, type: 'youtube' };
      if (video.sourceType === 'iframe')  return { src: video.videoSrc, type: 'iframe' };
      return { src: video.videoSrc, type: 'url' };
    },

    normalizeUrl,

    // ---- admin session ----
    isAdmin() { return sessionStorage.getItem(ADMIN_KEY) === '1'; },
    login(password) {
      if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem(ADMIN_KEY, '1');
        return true;
      }
      return false;
    },
    logout() { sessionStorage.removeItem(ADMIN_KEY); },

    // ---- user accounts ----
    async registerUser({ name, email, password, plan }) {
      name  = String(name  || '').trim();
      email = String(email || '').trim().toLowerCase();
      password = String(password || '');
      if (!name)     return { ok: false, error: 'Please enter your name.' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                     return { ok: false, error: 'Please enter a valid email.' };
      if (password.length < 6)
                     return { ok: false, error: 'Password must be at least 6 characters.' };
      const users = readUsers();
      if (users.some(u => u.email === email))
        return { ok: false, error: 'An account with this email already exists.' };
      const user = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name, email,
        passwordHash: await hashPassword(password),
        plan: plan || 'basic',
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      writeUsers(users);
      const s = toSession(user);
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(s));
      return { ok: true, user: s };
    },
    async loginUser(email, password) {
      email = String(email || '').trim().toLowerCase();
      const users = readUsers();
      const user = users.find(u => u.email === email);
      if (!user) return { ok: false, error: 'No account found for that email.' };
      const hash = await hashPassword(password);
      if (hash !== user.passwordHash)
        return { ok: false, error: 'Incorrect password.' };
      const s = toSession(user);
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(s));
      return { ok: true, user: s };
    },
    logoutUser() {
      localStorage.removeItem(USER_SESSION_KEY);
    },
    currentUser() {
      try { return JSON.parse(localStorage.getItem(USER_SESSION_KEY)); }
      catch (_) { return null; }
    },
    updatePlan(plan) {
      const s = this.currentUser();
      if (!s) return false;
      const users = readUsers();
      const i = users.findIndex(u => u.id === s.id);
      if (i < 0) return false;
      users[i].plan = plan;
      writeUsers(users);
      s.plan = plan;
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(s));
      return true;
    },
    userCount() { return readUsers().length; },
    getAllUsers() {
      // Never expose password hashes to the UI.
      return readUsers().map(u => ({
        id: u.id, name: u.name, email: u.email, plan: u.plan, createdAt: u.createdAt,
      }));
    },
    removeUser(id) {
      const users = readUsers();
      const next = users.filter(u => u.id !== id);
      if (next.length === users.length) return false;
      writeUsers(next);
      const s = this.currentUser();
      if (s && s.id === id) localStorage.removeItem(USER_SESSION_KEY);
      return true;
    },

    // ---- promoted flag (admin) ----
    setPromoted(videoId, promoted) {
      const list = read();
      const i = list.findIndex(v => String(v.id) === String(videoId));
      if (i < 0) return false;
      list[i].promoted = !!promoted;
      list[i].promotedAt = promoted ? new Date().toISOString() : null;
      return write(list);
    },
    isPromoted(videoId) {
      const v = this.getById(videoId);
      return !!(v && v.promoted);
    },
    getPromoted() {
      return read().filter(v => v.promoted);
    },

    // ---- user ratings ----
    _readRatings() {
      try { return JSON.parse(localStorage.getItem(RATINGS_KEY)) || {}; }
      catch (_) { return {}; }
    },
    _writeRatings(obj) {
      try { localStorage.setItem(RATINGS_KEY, JSON.stringify(obj)); return true; }
      catch (_) { return false; }
    },
    rateVideo(videoId, userId, stars) {
      stars = Math.max(1, Math.min(5, Math.round(Number(stars) || 0)));
      if (!videoId || !userId || !stars) return false;
      const all = this._readRatings();
      if (!all[videoId]) all[videoId] = {};
      all[videoId][userId] = { stars, at: new Date().toISOString() };
      return this._writeRatings(all);
    },
    clearRating(videoId, userId) {
      const all = this._readRatings();
      if (all[videoId] && all[videoId][userId]) {
        delete all[videoId][userId];
        return this._writeRatings(all);
      }
      return false;
    },
    getUserRating(videoId, userId) {
      const all = this._readRatings();
      const r = all[videoId] && all[videoId][userId];
      return r ? r.stars : 0;
    },
    getRatingStats(videoId) {
      const all = this._readRatings();
      const entries = all[videoId] ? Object.values(all[videoId]) : [];
      if (!entries.length) return { avg: 0, count: 0 };
      const sum = entries.reduce((a, b) => a + (b.stars || 0), 0);
      return { avg: sum / entries.length, count: entries.length };
    },
    getAllRatings() {
      return this._readRatings();
    },

    // ---- comments ----
    _readComments() {
      try { return JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {}; }
      catch (_) { return {}; }
    },
    _writeComments(obj) {
      try { localStorage.setItem(COMMENTS_KEY, JSON.stringify(obj)); return true; }
      catch (_) { return false; }
    },
    addComment(videoId, userId, userName, text) {
      text = String(text || '').trim();
      if (!videoId || !userId || !text) return null;
      if (text.length > 1000) text = text.slice(0, 1000);
      const all = this._readComments();
      if (!all[videoId]) all[videoId] = [];
      const c = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        userId, userName: String(userName || 'User'),
        text, createdAt: new Date().toISOString(),
      };
      all[videoId].unshift(c);
      this._writeComments(all);
      return c;
    },
    getComments(videoId) {
      const all = this._readComments();
      return all[videoId] ? all[videoId].slice() : [];
    },
    deleteComment(videoId, commentId) {
      const all = this._readComments();
      if (!all[videoId]) return false;
      const next = all[videoId].filter(c => c.id !== commentId);
      if (next.length === all[videoId].length) return false;
      all[videoId] = next;
      return this._writeComments(all);
    },
    getAllComments() {
      const all = this._readComments();
      const flat = [];
      Object.keys(all).forEach(vid => {
        all[vid].forEach(c => flat.push(Object.assign({ videoId: vid }, c)));
      });
      flat.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return flat;
    },
  };

  global.CineStore = Store;
})(window);
