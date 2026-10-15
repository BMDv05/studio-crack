'use strict';
/* Work page: Production (16:9 grid, wide player) vs Social Media (9:16 grid,
 * muted loop previews, vertical player). View comes from ?type= and the URL
 * is the source of truth, so direct links and the back button just work. */
(function () {
  const gridP = document.getElementById('grid-production');
  const gridS = document.getElementById('grid-social');
  if (!gridP || !gridS) return;

  const FALLBACK_POSTER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23134c4b'/%3E%3Cstop offset='1' stop-color='%23161919'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3C/svg%3E";
  const TITLES = {
    production: 'Work — Production films | Double H Studio',
    social: 'Work — Social videos | Double H Studio',
  };
  const DESCS = {
    production: 'Double H Studio portfolio: cinematic Production films — showreels, commercials and short films.',
    social: 'Double H Studio portfolio: vertical Social Media videos for Reels, TikTok and Shorts.',
  };

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dur(sec) {
    if (sec == null || !isFinite(sec)) return '';
    const m = Math.floor(sec / 60);
    return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  }
  function viewFromUrl() {
    return new URLSearchParams(location.search).get('type') === 'social' ? 'social' : 'production';
  }

  function prodCard(v) {
    const poster = v.thumbnail_url || FALLBACK_POSTER;
    return `<article class="work">
      <button class="playbtn" data-id="${esc(v.id)}" aria-label="Play ${esc(v.title)}" style="display:block;width:100%;border:0;padding:0;background:none;cursor:pointer">
        <video muted loop playsinline preload="none" poster="${esc(poster)}" data-src="${esc(v.video_url)}" style="pointer-events:none"></video>
      </button>
      <div class="meta"><h3>${esc(v.title)}</h3>
      ${v.description ? `<p>${esc(v.description)}</p>` : ''}
      ${v.client_name ? `<p style="color:#9db8b6;font-size:13px">Client: ${esc(v.client_name)}${dur(v.duration_sec) ? ` · ${dur(v.duration_sec)}` : ''}</p>` : (dur(v.duration_sec) ? `<p style="color:#9db8b6;font-size:13px">${dur(v.duration_sec)}</p>` : '')}</div>
    </article>`;
  }

  function socialCard(v) {
    const poster = v.thumbnail_url || FALLBACK_POSTER;
    const plats = (v.platforms || []).map((p) => `<span class="chip">${esc(p)}</span>`).join('');
    return `<article class="social-card">
      <button class="play" data-id="${esc(v.id)}" aria-label="Play ${esc(v.title)}">
        <video muted loop playsinline preload="none" poster="${esc(poster)}" data-src="${esc(v.video_url)}"></video>
      </button>
      <div class="meta"><h3>${esc(v.title)}</h3>
      ${v.description ? `<p>${esc(v.description)}</p>` : ''}
      ${plats ? `<div class="chips">${plats}</div>` : ''}</div>
    </article>`;
  }

  // Muted loop previews play while a card is in view (both views)
  function observePreviews(root) {
    const vids = root.querySelectorAll('video[data-src]');
    const load = (el) => {
      if (!el.querySelector('source')) {
        const s = document.createElement('source');
        s.src = el.getAttribute('data-src');
        s.type = 'video/mp4';
        el.appendChild(s);
        el.load();
      }
    };
    if (!('IntersectionObserver' in window)) {
      vids.forEach(load);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target;
        if (e.isIntersecting) {
          load(el);
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      }
    }, { rootMargin: '100px' });
    vids.forEach((el) => io.observe(el));
  }

  // Lightbox player (wide for production, narrow vertical for social)
  const player = document.getElementById('player');
  const playerVideo = document.getElementById('player-video');
  const playerBox = player ? player.querySelector('.player-box') : null;
  let lastFocus = null;
  function openPlayer(v) {
    if (!player) return;
    lastFocus = document.activeElement;
    playerVideo.src = v.video_url;
    playerVideo.poster = v.thumbnail_url || '';
    document.getElementById('player-title').textContent = v.title;
    document.getElementById('player-desc').textContent =
      [v.description, v.client_name ? `Client: ${v.client_name}` : '', (v.platforms || []).join(' · ')]
        .filter(Boolean).join('\n');
    if (playerBox) playerBox.classList.toggle('narrow', v.category === 'social');
    player.hidden = false;
    document.body.style.overflow = 'hidden';
    playerVideo.play().catch(() => {});
    player.querySelector('.player-x').focus();
  }
  function closePlayer() {
    if (!player || player.hidden) return;
    playerVideo.pause();
    playerVideo.removeAttribute('src');
    playerVideo.load();
    player.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  if (player) {
    player.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closePlayer));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') closePlayer(); });
  }

  function setJsonLd(videos) {
    const el = document.getElementById('video-ld');
    if (!el) return;
    try {
      el.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Double H Studio portfolio',
        itemListElement: videos.map((v, i) => ({
          '@type': 'VideoObject',
          position: i + 1,
          name: v.title,
          description: v.description || v.title,
          thumbnailUrl: v.thumbnail_url || undefined,
          contentUrl: v.video_url,
          uploadDate: (v.created_at || '').slice(0, 10) || undefined,
          duration: v.duration_sec ? `PT${Math.round(v.duration_sec)}S` : undefined,
        })),
      });
    } catch { /* noop */ }
  }

  const cache = { production: null, social: null };

  async function loadView(view) {
    document.querySelectorAll('.seg a').forEach((a) => {
      a.setAttribute('aria-current', String(a.dataset.view === view));
    });
    document.getElementById('view-production').hidden = view !== 'production';
    document.getElementById('view-social').hidden = view !== 'social';
    document.title = TITLES[view];
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', DESCS[view]);
    if (!cache[view]) {
      try {
        const r = await fetch(`/api/videos?category=${view}`, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error('feed');
        cache[view] = ((await r.json()).videos || []).filter((v) => v.video_url);
      } catch {
        cache[view] = [];
      }
    }
    render(view, cache[view]);
    setJsonLd(cache[view]);
  }

  function render(view, list) {
    const isSocial = view === 'social';
    const grid = isSocial ? gridS : gridP;
    document.getElementById('empty-production').hidden = isSocial || list.length > 0;
    document.getElementById('empty-social').hidden = !isSocial || list.length > 0;
    if (!list.length) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = list.map(isSocial ? socialCard : prodCard).join('');
    observePreviews(grid);
    grid.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = list.find((x) => x.id === btn.dataset.id);
        if (v) openPlayer(v);
      });
    });
  }

  // Segmented switch as real links: intercept for smooth swap, URL stays truth.
  document.querySelectorAll('.seg a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const view = a.dataset.view;
      history.pushState({ view }, '', a.getAttribute('href'));
      loadView(view);
    });
  });
  addEventListener('popstate', () => loadView(viewFromUrl()));

  loadView(viewFromUrl());
})();
