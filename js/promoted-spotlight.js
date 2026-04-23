// ==========================================================
// CineVerse — Promoted Spotlight
// Auto-mounts into any element with id="promoted-spotlight".
// If admin has promoted ≥ 1 video, renders a full-width hero
// banner with the video's thumbnail as background. Rotates
// through multiple promotions every 7s.
// ==========================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function basePath() {
    return window.location.pathname.includes('/pages/') ? '' : 'pages/';
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    const host = document.getElementById('promoted-spotlight');
    if (!host || !window.CineStore) return;
    const items = CineStore.getPromoted();
    if (!items.length) { host.style.display = 'none'; return; }

    const base = basePath();

    host.innerHTML = `
      <div class="spotlight">
        ${items.map((v, i) => {
          const s = CineStore.getRatingStats(v.id);
          const rating = s.count ? '★ ' + s.avg.toFixed(1) + ' (' + s.count + ')' : '★ Not rated yet';
          const bg = v.thumbUrl
            ? `background-image:url('${String(v.thumbUrl).replace(/'/g, "\\'")}');`
            : `background:linear-gradient(135deg,${v.color || '#5a2a99'},#070710);`;
          return `
            <div class="spotlight-slide${i === 0 ? ' active' : ''}" data-idx="${i}">
              <div class="spotlight-bg" style="${bg}"></div>
              <div class="spotlight-content">
                <div class="spotlight-pill">★ Promoted Pick</div>
                <h2 class="spotlight-title">${esc(v.title)}</h2>
                <div class="spotlight-meta">
                  <span class="sp-rating">${rating}</span>
                  <span>·</span><span>${esc(v.year || '')}</span>
                  <span>·</span><span>${esc(v.genre || '')}</span>
                  <span class="sp-tag">${esc(v.category || '')}</span>
                  ${v.badge ? `<span class="sp-tag" style="background:rgba(245,197,24,0.2);color:#f5c518;border-color:rgba(245,197,24,0.4);">${esc(v.badge)}</span>` : ''}
                </div>
                <p class="spotlight-desc">${esc(v.description || "Hand-picked by the CineVerse team — an exclusive highlight you won't want to miss.")}</p>
                <div class="spotlight-actions">
                  <a href="${base}watch.html?id=${encodeURIComponent(v.id)}" class="spotlight-btn primary">
                    <span>▶</span><span>Watch Now</span>
                  </a>
                  <a href="${base}watch.html?id=${encodeURIComponent(v.id)}#comments" class="spotlight-btn ghost">
                    <span>💬</span><span>Reviews</span>
                  </a>
                </div>
              </div>
            </div>`;
        }).join('')}
        ${items.length > 1 ? `
          <div class="spotlight-dots" id="spotlight-dots">
            ${items.map((_, i) => `<button type="button" class="spotlight-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i+1}"></button>`).join('')}
          </div>
        ` : ''}
      </div>`;

    if (items.length < 2) return;

    const slides = host.querySelectorAll('.spotlight-slide');
    const dots   = host.querySelectorAll('.spotlight-dot');
    let idx = 0, timer = null;

    function show(n) {
      idx = (n + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('active', i === idx));
      dots.forEach((d, i)   => d.classList.toggle('active', i === idx));
    }
    function tick() { show(idx + 1); }

    function start() { stop(); timer = setInterval(tick, 7000); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }

    dots.forEach(d => d.addEventListener('click', () => {
      show(parseInt(d.dataset.i, 10));
      start(); // reset timer on interaction
    }));

    const spot = host.querySelector('.spotlight');
    spot.addEventListener('mouseenter', stop);
    spot.addEventListener('mouseleave', start);

    start();
  });
})();
