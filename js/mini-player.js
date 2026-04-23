// ============================================
// CINEVERSE – Persistent Mini Player
// Floats in the corner and survives page navigation by saving
// playback state to sessionStorage. Re-mounts on every page.
// ============================================
(function () {
  'use strict';

  const KEY = 'cineverse_miniplayer_v1';
  const path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
  // Do not mount on pages where it would be awkward or duplicate
  if (/\/pages\/(watch|login|register|admin)\.html$/.test(path)) return;

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (_) { return null; }
  }
  function write(state) {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }
  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (_) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function watchPath() {
    return path.includes('/pages/') ? 'watch.html' : 'pages/watch.html';
  }

  function injectStyles() {
    if (document.getElementById('cv-mini-styles')) return;
    const style = document.createElement('style');
    style.id = 'cv-mini-styles';
    style.textContent = `
      #cv-mini {
        position: fixed;
        right: 20px; bottom: 20px;
        width: 320px;
        background: #0a0a12;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 14px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,47,201,0.25);
        z-index: 9999;
        overflow: hidden;
        font-family: 'Outfit', sans-serif;
        color: #fff;
        user-select: none;
        animation: cvMiniIn 0.25s ease;
      }
      @keyframes cvMiniIn {
        from { opacity: 0; transform: translateY(20px) scale(0.92); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
      }
      #cv-mini.dragging { transition: none; cursor: grabbing; }
      #cv-mini .cv-mini-head {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px;
        background: rgba(255,255,255,0.04);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        cursor: grab;
      }
      #cv-mini .cv-mini-title {
        flex: 1; min-width: 0;
        font-size: 0.82rem; font-weight: 600;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #cv-mini .cv-mini-btn {
        width: 26px; height: 26px; border-radius: 6px;
        background: transparent;
        border: 1px solid transparent;
        color: rgba(255,255,255,0.85);
        cursor: pointer; font-size: 0.9rem;
        display: flex; align-items: center; justify-content: center;
        padding: 0;
      }
      #cv-mini .cv-mini-btn:hover {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.12);
      }
      #cv-mini .cv-mini-btn.danger:hover {
        background: rgba(255,107,157,0.15);
        color: #ff6b9d;
      }
      #cv-mini .cv-mini-video {
        position: relative; width: 100%; aspect-ratio: 16/9;
        background: #000; cursor: pointer;
      }
      #cv-mini video, #cv-mini iframe {
        width: 100%; height: 100%; display: block; border: none;
      }
      #cv-mini .cv-mini-play {
        position: absolute; inset: 0;
        display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,0.35);
        pointer-events: none;
      }
      #cv-mini .cv-mini-play::after {
        content: '▶';
        font-size: 2rem; color: #fff;
        background: rgba(139,47,201,0.7);
        width: 54px; height: 54px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        padding-left: 4px;
      }
      #cv-mini.paused .cv-mini-play { display: flex; }
      #cv-mini .cv-mini-foot {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px;
        background: rgba(255,255,255,0.03);
        border-top: 1px solid rgba(255,255,255,0.08);
        font-size: 0.78rem; color: rgba(255,255,255,0.75);
      }
      #cv-mini .cv-mini-time { font-variant-numeric: tabular-nums; }
      #cv-mini .cv-mini-bar {
        flex: 1; height: 3px; background: rgba(255,255,255,0.15);
        border-radius: 2px; overflow: hidden;
      }
      #cv-mini .cv-mini-bar-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #8b2fc9, #c44dff);
        transition: width 0.25s;
      }
      @media (max-width: 640px) {
        #cv-mini { width: calc(100vw - 24px); right: 12px; bottom: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function mount(state, video) {
    injectStyles();

    // Resolve playable src from CineStore
    if (!window.CineStore) return;
    window.CineStore.getPlayableSrc(video).then(resolved => {
      if (!resolved || resolved.missing) { clear(); return; }

      const el = document.createElement('div');
      el.id = 'cv-mini';
      const isIframe = resolved.type === 'youtube' || resolved.type === 'iframe';

      el.innerHTML = `
        <div class="cv-mini-head" id="cv-drag">
          <div class="cv-mini-title">${esc(video.title)}</div>
          <button class="cv-mini-btn" id="cv-expand" title="Open in watch page">⤢</button>
          <button class="cv-mini-btn danger" id="cv-close" title="Close">✕</button>
        </div>
        <div class="cv-mini-video" id="cv-video">
          ${isIframe
            ? `<iframe src="${resolved.src}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`
            : `<video id="cv-vid" src="${resolved.src}" playsinline></video>
               <div class="cv-mini-play"></div>`}
        </div>
        ${isIframe ? '' : `
        <div class="cv-mini-foot">
          <span class="cv-mini-time" id="cv-time">0:00</span>
          <div class="cv-mini-bar"><div class="cv-mini-bar-fill" id="cv-bar"></div></div>
          <span class="cv-mini-time" id="cv-dur">0:00</span>
        </div>`}
      `;
      document.body.appendChild(el);

      // Restore saved position (for iframes only, add ?start= / #t= when supported later)
      if (!isIframe) {
        const vid = document.getElementById('cv-vid');
        vid.currentTime = state.t || 0;
        vid.volume = 0.6;
        if (state.playing !== false) vid.play().catch(() => { el.classList.add('paused'); });
        else el.classList.add('paused');

        vid.addEventListener('play',  () => el.classList.remove('paused'));
        vid.addEventListener('pause', () => el.classList.add('paused'));

        const timeEl = document.getElementById('cv-time');
        const durEl  = document.getElementById('cv-dur');
        const barEl  = document.getElementById('cv-bar');
        const fmt = s => {
          if (!s || !isFinite(s)) return '0:00';
          s = Math.floor(s);
          const m = Math.floor(s / 60), r = s % 60;
          return m + ':' + String(r).padStart(2, '0');
        };
        vid.addEventListener('loadedmetadata', () => { durEl.textContent = fmt(vid.duration); });
        vid.addEventListener('timeupdate', () => {
          timeEl.textContent = fmt(vid.currentTime);
          if (vid.duration) barEl.style.width = (vid.currentTime / vid.duration * 100) + '%';
          // Persist state so navigations keep the position fresh
          write({ id: video.id, t: vid.currentTime, playing: !vid.paused, thumb: video.thumbUrl || '' });
        });
        vid.addEventListener('ended', () => { clear(); el.remove(); });

        // Click video area to toggle play/pause
        document.getElementById('cv-video').addEventListener('click', (e) => {
          if (e.target.tagName === 'VIDEO' || e.target.classList.contains('cv-mini-video') || e.target.classList.contains('cv-mini-play')) {
            vid.paused ? vid.play() : vid.pause();
          }
        });
      }

      // Close button
      document.getElementById('cv-close').addEventListener('click', () => {
        if (resolved.revoke) resolved.revoke();
        clear();
        el.remove();
      });

      // Expand → go to watch page, mini-player closes itself there
      document.getElementById('cv-expand').addEventListener('click', () => {
        // Keep state so watch page can resume
        window.location.href = watchPath() + '?id=' + encodeURIComponent(video.id);
      });

      // Drag by the header
      makeDraggable(el, document.getElementById('cv-drag'));

      // Save state right before leaving so the next page picks up
      window.addEventListener('beforeunload', () => {
        const vid = document.getElementById('cv-vid');
        if (vid && vid.currentTime > 1 && !vid.ended) {
          write({ id: video.id, t: vid.currentTime, playing: !vid.paused, thumb: video.thumbUrl || '' });
        }
        if (resolved.revoke) resolved.revoke();
      });
    }).catch(() => { clear(); });
  }

  function makeDraggable(el, handle) {
    let dragging = false, sx = 0, sy = 0, startRight = 0, startBottom = 0;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cv-mini-btn')) return;
      dragging = true;
      el.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY;
      const cs = getComputedStyle(el);
      startRight  = parseFloat(cs.right)  || 20;
      startBottom = parseFloat(cs.bottom) || 20;
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const nr = Math.max(6, Math.min(window.innerWidth  - el.offsetWidth  - 6, startRight  - dx));
      const nb = Math.max(6, Math.min(window.innerHeight - el.offsetHeight - 6, startBottom - dy));
      el.style.right  = nr + 'px';
      el.style.bottom = nb + 'px';
    });
    ['pointerup','pointercancel'].forEach(ev => handle.addEventListener(ev, () => {
      dragging = false; el.classList.remove('dragging');
    }));
  }

  // ---- Boot ----
  function boot() {
    const state = read();
    if (!state || !state.id) return;
    if (!window.CineStore) return;
    const video = window.CineStore.getById(state.id);
    if (!video) { clear(); return; }
    mount(state, video);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
