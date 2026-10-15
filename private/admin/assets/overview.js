'use strict';
(function () {
  const { api, esc, fmtWhen, initShell, toast } = window.Admin;
  initShell('overview');
  (async () => {
    try {
      const [stats, meta] = await Promise.all([api('/api/admin/stats'), api('/api/admin/meta')]);
      const tz = meta.timezone;
      document.getElementById('stats').innerHTML = [
        [stats.unread, 'New requests (unread)'],
        [stats.thisWeek, 'Requests this week'],
        [stats.confirmed, 'Confirmed meetings'],
        [stats.publishedProduction, 'Published · Production'],
        [stats.publishedSocial, 'Published · Social Media'],
        [stats.draftProduction, 'Drafts · Production'],
        [stats.draftSocial, 'Drafts · Social Media'],
      ].map(([n, l]) => `<div class="card stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join('');
      document.getElementById('latest').innerHTML = stats.latest.length
        ? stats.latest.map((r) => `<a class="listlink" href="/admin/request?id=${encodeURIComponent(r.id)}"><span>${esc(r.full_name)} — ${esc(r.service)}${r.unread ? ' · New' : ''}</span><small>${esc(fmtWhen(r.created_at, tz))}</small></a>`).join('') +
          `<a class="listlink" href="/admin/requests"><span>View all requests →</span></a>`
        : '<div class="empty">No meeting requests yet.</div>';
      document.getElementById('recent').innerHTML = stats.recentVideos.length
        ? stats.recentVideos.map((v) => `<a class="listlink" href="/admin/videos"><span>${esc(v.title)} · ${v.status}</span><small>${esc(fmtWhen(v.created_at, tz))}</small></a>`).join('') +
          `<a class="listlink" href="/admin/videos"><span>Manage videos →</span></a>`
        : '<div class="empty">No uploads yet.</div>';
    } catch (e) {
      toast('Could not load overview.', 'err');
    }
  })();
})();
