// ============================================
// CINEVERSE – Main Application Script
// ============================================

(function () {
  'use strict';

  /* ===== MOVIE / SERIES DATA (admin uploads only) ===== */
  const STORE = (typeof window !== 'undefined' && window.CineStore) ? window.CineStore : null;
  const MOVIES = STORE ? STORE.getByCategory('Movies') : [];
  const SERIES = STORE ? STORE.getByCategory('Series') : [];

  /* ===== LOADER ===== */
  const loader = document.getElementById('loader');
  if (loader) {
    window.addEventListener('load', () => {
      setTimeout(() => loader.classList.add('hidden'), 2100);
    });
  }

/* ===== NAVBAR ===== */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    let navTick = false;
    window.addEventListener('scroll', () => {
      if (navTick) return;
      navTick = true;
      requestAnimationFrame(() => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
        navTick = false;
      });
    }, { passive: true });
    // Active Link
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          navLinks.forEach(l => l.classList.remove('active'));
          const active = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
          if (active) active.classList.add('active');
        }
      });
    }, { threshold: 0.4 });
    sections.forEach(s => observer.observe(s));
  }

  /* ===== UNIVERSAL USER MENU (sign in ⇄ dashboard + sign out) ===== */
  function escapeHtmlSafe(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function renderUserMenu() {
    if (!STORE) return;
    const nav  = document.querySelector('.nav-actions');
    if (!nav) return;
    const user = STORE.currentUser();

    // Hidden admin button — only visible after admin login in same session.
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn && !STORE.isAdmin()) adminBtn.remove();

    const signInA = nav.querySelector('a[href$="login.html"]');
    const startA  = nav.querySelector('a[href$="register.html"]');

    if (user) {
      if (signInA) signInA.remove();
      if (startA)  startA.remove();
      if (!document.getElementById('nm-user')) {
        const isPages = window.location.pathname.replace(/\\/g,'/').includes('/pages/');
        const dashHref = isPages ? 'dashboard.html' : 'pages/dashboard.html';
        const first  = (user.name || 'User').split(' ')[0];
        const initial = (user.name || '?').trim().charAt(0).toUpperCase() || '?';
        const frag = document.createElement('span');
        frag.id = 'nm-user';
        frag.style.cssText = 'display:inline-flex;align-items:center;gap:10px;';
        frag.innerHTML = `
          <a href="${dashHref}" class="btn-nav btn-sign-in" style="display:inline-flex;align-items:center;gap:8px;padding:4px 14px 4px 4px;text-decoration:none;">
            <span style="width:30px;height:30px;border-radius:50%;background:linear-gradient(145deg,#8b2fc9,#c44dff);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;color:#fff;">${escapeHtmlSafe(initial)}</span>
            <span>${escapeHtmlSafe(first)}</span>
          </a>
          <button type="button" id="nm-signout" class="btn-nav btn-sign-in" style="background:transparent;border:1px solid var(--clr-border-2);padding:8px 14px;cursor:pointer;">Sign Out</button>`;
        const hamb = nav.querySelector('.hamburger, #hamburger');
        if (hamb) nav.insertBefore(frag, hamb); else nav.appendChild(frag);
        document.getElementById('nm-signout').addEventListener('click', () => {
          STORE.logoutUser();
          window.location.reload();
        });
      }
    }
  }
  renderUserMenu();

  /* ===== HIDDEN ADMIN SHORTCUT (Ctrl+Shift+A) ===== */
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      const isPages = window.location.pathname.replace(/\\/g,'/').includes('/pages/');
      window.location.href = (isPages ? '' : 'pages/') + 'admin.html';
    }
  });

  /* ===== HAMBURGER ===== */
  const hamburger = document.getElementById('hamburger');
  const navLinksEl = document.getElementById('nav-links');
  if (hamburger && navLinksEl) {
    hamburger.addEventListener('click', () => {
      navLinksEl.classList.toggle('mobile-open');
      const spans = hamburger.querySelectorAll('span');
      const open = navLinksEl.classList.contains('mobile-open');
      spans[0].style.transform = open ? 'rotate(45deg) translate(5px, 5px)' : '';
      spans[1].style.opacity   = open ? '0' : '1';
      spans[2].style.transform = open ? 'rotate(-45deg) translate(5px, -5px)' : '';
    });
    navLinksEl.querySelectorAll('.nav-link').forEach(l => {
      l.addEventListener('click', () => {
        navLinksEl.classList.remove('mobile-open');
        hamburger.querySelectorAll('span').forEach(s => {
          s.style.transform = '';
          s.style.opacity = '1';
        });
      });
    });
  }

  /* ===== SEARCH OVERLAY (real search over uploaded items) ===== */
  const searchToggle  = document.getElementById('search-toggle');
  const searchOverlay = document.getElementById('search-overlay');
  const searchClose   = document.getElementById('search-close');
  const searchInput   = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function runSearch(q) {
    if (!searchResults) return;
    const term = q.trim().toLowerCase();
    if (!term) { searchResults.innerHTML = ''; return; }
    const all = STORE ? STORE.getAll() : [];
    const matches = all.filter(v => {
      return (v.title || '').toLowerCase().includes(term)
          || (v.genre || '').toLowerCase().includes(term)
          || (v.category || '').toLowerCase().includes(term)
          || String(v.year || '').includes(term);
    }).slice(0, 12);
    if (!matches.length) {
      searchResults.innerHTML = `<div class="search-empty">No matches for "${escapeHtml(q)}". Upload videos from the admin panel.</div>`;
      return;
    }
    const base = window.location.pathname.includes('/pages/') ? '' : 'pages/';
    searchResults.innerHTML = matches.map(v => {
      const thumb = v.thumbUrl
        ? `style="background-image:url('${String(v.thumbUrl).replace(/'/g,"\\'")}');"`
        : `style="background:linear-gradient(145deg,${v.color || '#5a2a99'}cc,#070710);"`;
      return `
        <a href="${base}watch.html?id=${encodeURIComponent(v.id)}" class="search-result">
          <div class="sr-thumb" ${thumb}></div>
          <div class="sr-body">
            <div class="sr-title">${escapeHtml(v.title)}</div>
            <div class="sr-meta">${escapeHtml(v.category || '')} · ${escapeHtml(v.genre || '')} · ${escapeHtml(String(v.year || ''))}</div>
          </div>
        </a>`;
    }).join('');
  }

  if (searchToggle && searchOverlay) {
    searchToggle.addEventListener('click', () => {
      searchOverlay.classList.add('active');
      setTimeout(() => searchInput && searchInput.focus(), 100);
    });
    searchClose && searchClose.addEventListener('click', () => {
      searchOverlay.classList.remove('active');
      if (searchInput) searchInput.value = '';
      if (searchResults) searchResults.innerHTML = '';
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') searchOverlay.classList.remove('active');
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', e => runSearch(e.target.value));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const first = searchResults && searchResults.querySelector('.search-result');
        if (first) window.location.href = first.getAttribute('href');
      }
    });
  }

  /* ===== PARTICLE GENERATOR ===== */
  const particleContainer = document.getElementById('particles');
  if (particleContainer) {
    const COLORS = ['rgba(139,47,201,', 'rgba(196,77,255,', 'rgba(245,197,24,', 'rgba(255,107,157,'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.classList.add('particle');
      const size = Math.random() * 5 + 2;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const opacity = Math.random() * 0.6 + 0.1;
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${Math.random() * 100}%;
        background:${color}${opacity});
        animation-duration:${Math.random() * 20 + 10}s;
        animation-delay:-${Math.random() * 20}s;
        box-shadow:0 0 ${size * 3}px ${color}0.5);
      `;
      particleContainer.appendChild(p);
    }
  }

  /* ===== CARD BUILDER ===== */
  function buildCard(item) {
    const thumb = buildFakeThumb(item);
    // Uploaded videos (any id format — old `u123` or slug like `sniper-no-nation`)
    // live in CineStore. If the item resolves there, it's playable.
    const isUpload = !!(STORE && STORE.getById && STORE.getById(item.id));
    const basePath = window.location.pathname.includes('/pages/') ? '' : 'pages/';
    const wrapTag  = isUpload ? 'a' : 'div';
    const wrapAttr = isUpload
      ? `href="${basePath}watch.html?id=${item.id}" style="text-decoration:none;color:inherit;display:block;"`
      : '';
    const s = STORE ? STORE.getRatingStats(item.id) : { avg: 0, count: 0 };
    const ratingTxt = s.count ? '★ ' + s.avg.toFixed(1) : '★ —';
    return `
      <${wrapTag} class="movie-card reveal" data-id="${item.id}" ${wrapAttr}>
        <div class="card-thumb">
          ${thumb}
          ${item.badge ? `<div class="card-badge">${item.badge}</div>` : ''}
          ${item.promoted ? '<div class="card-badge" style="right:10px;left:auto;background:linear-gradient(135deg,#f5c518,#ff9f1c);color:#0a0612;">★ PROMOTED</div>' : ''}
          <div class="card-overlay">
            <div class="card-play-btn">▶</div>
          </div>
        </div>
        <div class="card-info">
          <div class="card-title">${item.title}</div>
          <div class="card-meta">
            <span class="card-rating">${ratingTxt}</span>
            <span>·</span>
            <span>${item.year}</span>
            <span>·</span>
            <span>${item.genre}</span>
          </div>
        </div>
      </${wrapTag}>`;
  }

  function buildFakeThumb(item) {
    // Use uploaded thumbnail image if present, otherwise fall back to gradient + initials.
    if (item.thumbUrl) {
      return `
        <div style="
          width:100%;height:100%;min-height:200px;
          background-image:url('${String(item.thumbUrl).replace(/'/g, "\\'")}');
          background-size:cover;background-position:center;
          position:relative;overflow:hidden;
        ">
          <div style="
            position:absolute;inset:0;
            background:linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.45) 100%);
          "></div>
        </div>`;
    }
    const initials = item.title.split(' ').map(w => w[0]).slice(0,2).join('');
    return `
      <div style="
        width:100%;height:100%;
        background:linear-gradient(145deg,${item.color}cc,#070710);
        display:flex;align-items:center;justify-content:center;
        flex-direction:column;gap:8px;min-height:200px;
        position:relative;overflow:hidden;
      ">
        <div style="
          position:absolute;inset:0;
          background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.1), transparent 60%);
        "></div>
        <div style="
          font-size:2.8rem;font-weight:900;
          color:rgba(255,255,255,0.9);
          text-shadow:0 4px 20px rgba(0,0,0,0.5);
          position:relative;
        ">${initials}</div>
        <div style="
          font-size:0.7rem;font-weight:600;
          color:rgba(255,255,255,0.5);
          text-transform:uppercase;letter-spacing:2px;
          position:relative;
        ">${item.genre}</div>
      </div>`;
  }

  /* ===== EMPTY STATE ===== */
  function emptyState(label) {
    return `
      <div style="
        grid-column:1/-1;width:100%;
        text-align:center;padding:60px 20px;
        color:var(--clr-text-muted);
        border:1px dashed var(--clr-border-2);
        border-radius:16px;background:rgba(255,255,255,0.02);
      ">
        <div style="font-size:2.2rem;margin-bottom:10px;opacity:0.6;">🎬</div>
        <div style="font-weight:700;color:var(--clr-text);margin-bottom:6px;">No ${label} yet</div>
        <div style="font-size:0.85rem;">Uploads from the admin panel will appear here.</div>
      </div>`;
  }

  /* ===== INJECT MOVIES ===== */
  const moviesGrid = document.getElementById('movies-grid');
  if (moviesGrid) {
    moviesGrid.innerHTML = MOVIES.length ? MOVIES.map(buildCard).join('') : emptyState('movies');
  }

  /* ===== INJECT SERIES SLIDER ===== */
  const seriesTrack = document.getElementById('series-track');
  if (seriesTrack) {
    seriesTrack.innerHTML = SERIES.length ? SERIES.map(buildCard).join('') : emptyState('series');
  }

  /* ===== INJECT ORIGINALS (homepage banner cards) ===== */
  const originalsCards = document.getElementById('originals-cards');
  if (originalsCards) {
    const ORIGINALS = STORE ? STORE.getByCategory('Originals') : [];
    if (ORIGINALS.length === 0) {
      originalsCards.style.display = 'none';
    } else {
      const basePath = window.location.pathname.includes('/pages/') ? '' : 'pages/';
      originalsCards.innerHTML = ORIGINALS.slice(0, 3).map((o, i) => {
        const bg = o.thumbUrl
          ? `background-image:linear-gradient(180deg,rgba(7,7,16,0.35) 40%,rgba(7,7,16,0.85) 100%),url('${String(o.thumbUrl).replace(/'/g, "\\'")}');background-size:cover;background-position:center;`
          : `background:linear-gradient(145deg,${o.color}cc,#070710);`;
        return `
        <a href="${basePath}watch.html?id=${o.id}" class="orig-card orig-card-${i+1}"
           style="text-decoration:none;color:inherit;${bg}">
          <div class="orig-card-glow"></div>
          <span class="orig-label">ORIGINAL</span>
          <h3>${o.title}</h3>
          <p>${o.genre} · ${o.year}</p>
        </a>`;
      }).join('');
    }
  }

  /* ===== SERIES SLIDER CONTROLS ===== */
  const seriesPrev = document.getElementById('series-prev');
  const seriesNext = document.getElementById('series-next');
  if (seriesPrev && seriesNext && seriesTrack) {
    const scrollAmt = 260;
    seriesNext.addEventListener('click', () => {
      seriesTrack.scrollLeft += scrollAmt;
    });
    seriesPrev.addEventListener('click', () => {
      seriesTrack.scrollLeft -= scrollAmt;
    });
    // Touch swipe
    let startX = 0;
    seriesTrack.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    seriesTrack.addEventListener('touchend', e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) seriesTrack.scrollLeft += diff > 0 ? scrollAmt : -scrollAmt;
    }, { passive: true });
  }

  /* ===== VIDEO MODAL (plays a real uploaded video) ===== */
  const trailerBtn   = document.getElementById('trailer-btn');
  const modalTrailer = document.getElementById('modal-trailer');
  const modalClose   = document.getElementById('modal-close');
  const trailerWrap  = document.getElementById('trailer-wrap');
  const trailerEmpty = document.getElementById('trailer-empty');
  const trailerMeta  = document.getElementById('trailer-meta');
  const trailerTitle = document.getElementById('trailer-title');
  const trailerSub   = document.getElementById('trailer-sub');
  let trailerRevoke  = null;

  function closeTrailer() {
    if (!modalTrailer) return;
    modalTrailer.classList.remove('active');
    if (trailerWrap) {
      const media = trailerWrap.querySelector('video, iframe');
      if (media) media.remove();
      if (trailerEmpty) trailerEmpty.style.display = '';
    }
    if (trailerMeta) trailerMeta.style.display = 'none';
    if (trailerRevoke) { try { trailerRevoke(); } catch(_){} trailerRevoke = null; }
  }

  async function openTrailer() {
    if (!modalTrailer || !trailerWrap) return;
    modalTrailer.classList.add('active');
    const all = STORE ? STORE.getAll() : [];
    if (!all.length) {
      if (trailerEmpty) trailerEmpty.style.display = '';
      if (trailerMeta) trailerMeta.style.display = 'none';
      return;
    }
    const pick = all[0];
    const res = await STORE.getPlayableSrc(pick);
    if (!res.src || res.missing) {
      if (trailerEmpty) {
        trailerEmpty.style.display = '';
        trailerEmpty.querySelector('p').innerHTML = 'Video file is missing. Re-upload from the admin panel.';
      }
      return;
    }
    if (trailerEmpty) trailerEmpty.style.display = 'none';
    const existing = trailerWrap.querySelector('video, iframe');
    if (existing) existing.remove();
    if (res.type === 'youtube' || res.type === 'iframe') {
      const iframe = document.createElement('iframe');
      iframe.src = res.src;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;display:block;';
      trailerWrap.appendChild(iframe);
    } else {
      const video = document.createElement('video');
      video.src = res.src;
      video.controls = true;
      video.autoplay = true;
      video.style.cssText = 'width:100%;aspect-ratio:16/9;background:#000;display:block;';
      trailerWrap.appendChild(video);
    }
    if (res.revoke) trailerRevoke = res.revoke;
    if (trailerMeta)  trailerMeta.style.display = '';
    if (trailerTitle) trailerTitle.textContent = pick.title || 'Untitled';
    if (trailerSub)   trailerSub.textContent = [pick.category, pick.genre, pick.year].filter(Boolean).join(' · ');
  }

  if (trailerBtn && modalTrailer) {
    trailerBtn.addEventListener('click', openTrailer);
    modalClose && modalClose.addEventListener('click', closeTrailer);
    modalTrailer.addEventListener('click', (e) => {
      if (e.target === modalTrailer) closeTrailer();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalTrailer.classList.contains('active')) closeTrailer();
    });
  }

  /* ===== SCROLL REVEAL ===== */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  function observeReveal() {
    document.querySelectorAll('.reveal, .reveal-left').forEach(el => revealObserver.observe(el));
  }
  observeReveal();

  // Re-observe after cards are injected
  setTimeout(observeReveal, 200);

  /* ===== LIVE LIBRARY STATS (real counts, animated) ===== */
  const allItems = STORE ? STORE.getAll() : [];
  function countCategory(cat) {
    return allItems.filter(v => (v.category || '').toLowerCase() === cat.toLowerCase()).length;
  }
  const statNums = document.querySelectorAll('.stat-num[data-source]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el     = entry.target;
        const target = countCategory(el.dataset.source);
        const duration = 1200;
        if (target === 0) { el.textContent = '0'; counterObserver.unobserve(el); return; }
        const step   = Math.max(1, target / (duration / 16));
        let current  = 0;
        const tick = () => {
          current += step;
          if (current >= target) {
            el.textContent = target.toLocaleString();
            return;
          }
          el.textContent = Math.floor(current).toLocaleString();
          requestAnimationFrame(tick);
        };
        tick();
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  statNums.forEach(el => counterObserver.observe(el));

  /* ===== GENRE COUNTS (real) ===== */
  document.querySelectorAll('.genre-card[data-genre]').forEach(card => {
    const genre = card.dataset.genre;
    const count = allItems.filter(v => (v.genre || '').toLowerCase() === genre.toLowerCase()).length;
    const label = card.querySelector('.genre-count');
    if (label) label.textContent = count + (count === 1 ? ' title' : ' titles');
  });

  /* ===== PROMOTED + LATEST GRIDS ===== */
  const base = window.location.pathname.includes('/pages/') ? '' : 'pages/';
  function cardFor(v) {
    const thumb = v.thumbUrl
      ? `<div style="width:100%;height:100%;min-height:220px;background-image:url('${String(v.thumbUrl).replace(/'/g,"\\'")}');background-size:cover;background-position:center;"></div>`
      : `<div style="width:100%;height:100%;min-height:220px;background:linear-gradient(145deg,${v.color || '#5a2a99'}cc,#070710);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.85);font-weight:900;font-size:2rem;">${escapeHtml((v.title||'?').slice(0,2).toUpperCase())}</div>`;
    const s = STORE ? STORE.getRatingStats(v.id) : { avg: 0, count: 0 };
    const ratingTxt = s.count ? '★ ' + s.avg.toFixed(1) : '★ —';
    return `
      <a href="${base}watch.html?id=${encodeURIComponent(v.id)}" class="movie-card reveal visible" style="text-decoration:none;color:inherit;display:block;">
        <div class="card-thumb">
          ${thumb}
          ${v.badge ? `<div class="card-badge">${escapeHtml(v.badge)}</div>` : ''}
          ${v.promoted ? '<div class="card-badge" style="right:10px;left:auto;background:linear-gradient(135deg,#f5c518,#ff9f1c);color:#0a0612;">★ PROMOTED</div>' : ''}
          <div class="card-overlay"><div class="card-play-btn">▶</div></div>
        </div>
        <div class="card-info">
          <div class="card-title">${escapeHtml(v.title)}</div>
          <div class="card-meta">
            <span class="card-rating">${ratingTxt}</span>
            <span>·</span><span>${escapeHtml(String(v.year || ''))}</span>
            <span>·</span><span>${escapeHtml(v.genre || '')}</span>
          </div>
        </div>
      </a>`;
  }

  const latestSection = document.getElementById('latest-section');
  const latestGrid    = document.getElementById('latest-grid');
  if (latestSection && latestGrid && allItems.length) {
    latestSection.style.display = '';
    const recent = allItems.slice(0, 8);
    latestGrid.innerHTML = recent.map(cardFor).join('');
  }

  /* ===== CTA EMAIL (real — forwards email to register) ===== */
  const ctaForm = document.getElementById('cta-form');
  const ctaMsg  = document.getElementById('cta-msg');
  if (ctaForm) {
    ctaForm.addEventListener('submit', e => {
      e.preventDefault();
      const email = (document.getElementById('cta-email').value || '').trim();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!ok) {
        if (ctaMsg) { ctaMsg.textContent = 'Please enter a valid email address.'; ctaMsg.style.color = '#ff6b9d'; }
        return;
      }
      const base = window.location.pathname.includes('/pages/') ? '' : 'pages/';
      window.location.href = base + 'register.html?email=' + encodeURIComponent(email);
    });
  }

  /* ===== FOOTER LIBRARY COUNT ===== */
  const footerCount = document.getElementById('footer-count');
  if (footerCount) {
    const n = allItems.length;
    footerCount.textContent = n + (n === 1 ? ' title in your library' : ' titles in your library');
  }

  /* ===== ADD REVEAL TO SECTION ELEMENTS ===== */
  document.querySelectorAll('.section-header, .step-card, .price-card, .testimonial-card, .genre-card, .orig-card').forEach(el => {
    el.classList.add('reveal');
  });

  /* ===== PARALLAX HERO ===== */
  const heroBg = document.querySelector('.hero-img');
  if (heroBg) {
    let pxTick = false;
    window.addEventListener('scroll', () => {
      if (pxTick) return;
      pxTick = true;
      requestAnimationFrame(() => {
        heroBg.style.transform = `scale(1.08) translateY(${window.scrollY * 0.25}px)`;
        pxTick = false;
      });
    }, { passive: true });
  }

  /* ===== SMOOTH HOVER GLOW ON MOVIE CARDS =====
     Delegated listener: only updates the card the cursor is actually over.
     rAF-throttled so we don't do layout work per raw mouse sample. */
  const HOVER_SELECTOR = '.movie-card, .testimonial-card, .price-card, .step-card';
  let hoverCard = null, hoverX = 0, hoverY = 0, hoverPending = false;
  function flushHover() {
    hoverPending = false;
    if (!hoverCard) return;
    const r = hoverCard.getBoundingClientRect();
    hoverCard.style.setProperty('--mouse-x', (hoverX - r.left) + 'px');
    hoverCard.style.setProperty('--mouse-y', (hoverY - r.top)  + 'px');
  }
  document.addEventListener('mousemove', (e) => {
    const card = e.target.closest && e.target.closest(HOVER_SELECTOR);
    if (!card) { hoverCard = null; return; }
    hoverCard = card; hoverX = e.clientX; hoverY = e.clientY;
    if (!hoverPending) { hoverPending = true; requestAnimationFrame(flushHover); }
  }, { passive: true });

  console.log('%cCineVerse 🎬 Loaded', 'color:#c44dff;font-size:1.5rem;font-weight:900;');
})();
