'use strict';
/* Shared frontend behavior: mobile menu, hero video controls, lazy portfolio,
 * booking form validation + submission (spec sections 5-6, 12, 15-16). */
(function () {
  // Mobile menu
  const menuBtn = document.querySelector('[data-menu]');
  const links = document.querySelector('[data-links]');
  if (menuBtn && links) {
    menuBtn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
  }

  // Hero video: pause control, data-saver + reduced-motion respect
  const heroVideo = document.querySelector('[data-hero-video]');
  const heroToggle = document.querySelector('[data-hero-toggle]');
  try {
    const saveData = navigator.connection && navigator.connection.saveData;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (heroVideo && (saveData || reduced)) heroVideo.pause();
  } catch { /* ignore */ }
  if (heroVideo && heroToggle) {
    heroToggle.addEventListener('click', () => {
      if (heroVideo.paused) { heroVideo.play(); heroToggle.textContent = 'Pause background video'; }
      else { heroVideo.pause(); heroToggle.textContent = 'Play background video'; }
    });
  }

  // Lazy portfolio videos: load only when scrolled into view (spec 15)
  const lazyVideos = document.querySelectorAll('video[data-lazy]');
  if ('IntersectionObserver' in window && lazyVideos.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const v = e.target;
          const src = v.getAttribute('data-src');
          if (src && !v.querySelector('source')) {
            const s = document.createElement('source');
            s.src = src; s.type = 'video/mp4';
            v.appendChild(s); v.load();
          }
          io.unobserve(v);
        }
      }
    }, { rootMargin: '200px' });
    lazyVideos.forEach((v) => io.observe(v));
  }

  // Booking form
  const form = document.querySelector('[data-booking-form]');
  if (!form) return;
  const loadedAt = Date.now();
  const keyInput = form.querySelector('[name="submissionKey"]');
  try {
    if (keyInput && !keyInput.value) {
      keyInput.value = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    }
  } catch { if (keyInput) keyInput.value = String(Date.now()); }

  const status = form.querySelector('[data-status]');
  const submitBtn = form.querySelector('[type="submit"]');

  function setError(name, msg) {
    const field = form.querySelector(`[data-field="${name}"]`);
    if (!field) return;
    const err = field.querySelector('.error');
    if (err) err.textContent = msg || '';
    field.classList.toggle('invalid', !!msg);
    const input = field.querySelector('input,select,textarea');
    if (input && msg) input.setAttribute('aria-invalid', 'true');
    else if (input) input.removeAttribute('aria-invalid');
  }

  function clientValidate(fd) {
    const errors = {};
    if ((fd.get('full_name') || '').toString().trim().length < 2) errors.full_name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((fd.get('email') || '').toString().trim())) errors.email = 'Please enter a valid email address.';
    if (!fd.get('service')) errors.service = 'Please choose a service.';
    if ((fd.get('description') || '').toString().trim().length < 10) errors.description = 'Please describe your project (at least 10 characters).';
    if (!fd.get('preferred_date')) errors.preferred_date = 'Please choose a preferred date.';
    else {
      const today = new Date().toISOString().slice(0, 10);
      if (fd.get('preferred_date') < today) errors.preferred_date = 'Preferred date must not be in the past.';
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test((fd.get('preferred_time') || '').toString())) errors.preferred_time = 'Please choose a valid time (HH:MM).';
    if (!['online', 'in_person'].includes((fd.get('meeting_type') || '').toString())) errors.meeting_type = 'Please choose Online or In-person.';
    if (!form.querySelector('[name="consent"]').checked) errors.consent = 'Please accept the privacy notice.';
    return errors;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (status) { status.textContent = ''; }
    ['full_name', 'email', 'service', 'description', 'preferred_date', 'preferred_time', 'meeting_type', 'consent'].forEach((n) => setError(n, ''));
    const fd = new FormData(form);
    const errors = clientValidate(fd);
    Object.entries(errors).forEach(([k, v]) => setError(k, v));
    if (Object.keys(errors).length) {
      if (status) status.textContent = 'Please fix the highlighted fields and try again.';
      const firstInvalid = form.querySelector('.field.invalid input,.field.invalid select,.field.invalid textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }
    const payload = {
      full_name: fd.get('full_name'), email: fd.get('email'), phone: fd.get('phone') || '',
      company: fd.get('company') || '', service: fd.get('service'), description: fd.get('description'),
      preferred_date: fd.get('preferred_date'), preferred_time: fd.get('preferred_time'),
      meeting_type: fd.get('meeting_type'), consent: true,
      website: fd.get('website') || '', // honeypot
      submissionKey: fd.get('submissionKey') || '', loadedAt,
    };
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = 'Sending…';
    try {
      const resp = await fetch('/api/booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 201 && data.ok) {
        window.location.href = '/book/thank-you?reference=' + encodeURIComponent(data.reference || '');
        return;
      }
      if (resp.status === 422 && data.errors) {
        Object.entries(data.errors).forEach(([k, v]) => setError(k, v));
        if (status) status.textContent = 'Please fix the highlighted fields and try again.';
        return;
      }
      if (resp.status === 429) {
        if (status) status.textContent = 'Too many requests. Please try again later.';
        return;
      }
      if (status) status.textContent = 'Something went wrong. Please try again.';
    } catch {
      if (status) status.textContent = 'Network error. Please check your connection and try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });
})();
