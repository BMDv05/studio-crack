'use strict';
(function () {
  const { api, initShell, toast } = window.Admin;

  function showErrors(errors) {
    document.querySelectorAll('[data-e]').forEach((el) => { el.textContent = ''; });
    Object.entries(errors || {}).forEach(([k, v]) => {
      const el = document.querySelector(`[data-e="${k}"]`);
      if (el) el.textContent = v;
    });
  }

  (async () => {
    await initShell('settings');
    try {
      const d = await api('/api/admin/settings');
      const s = d.settings;
      document.getElementById('s-tz').value = s.timezone;
      document.getElementById('s-sla').value = s.sla;
      document.getElementById('s-services').value = s.services.join('\n');
      document.getElementById('s-inbox').textContent = s.studioEmail;
      document.getElementById('s-max-prod').value = s.maxUploadMbProduction;
      document.getElementById('s-max-social').value = s.maxUploadMbSocial;
      document.getElementById('s-max-sec').value = s.maxSocialSec;
      document.getElementById('s-driver').value = s.storageDriver;
      document.getElementById('s3state').textContent = s.storageDriver === 's3'
        ? (s.storageS3 ? 'Object storage credentials detected — uploads go direct to storage.' : 'S3 selected but S3_* variables are missing — uploads fall back to local disk.')
        : 'Local disk: files stream through the app server. Set STORAGE_DRIVER=s3 + S3_* for direct uploads.';
    } catch { toast('Could not load settings.', 'err'); }

    document.getElementById('save-profile').onclick = async () => {
      showErrors({});
      try {
        await api('/api/admin/settings', { method: 'PATCH', body: {
          timezone: document.getElementById('s-tz').value.trim(),
          sla: document.getElementById('s-sla').value.trim(),
          services: document.getElementById('s-services').value,
        } });
        toast('Profile saved.', 'ok');
      } catch (e) { showErrors(e.errors); toast('Check the highlighted fields.', 'err'); }
    };
    document.getElementById('save-uploads').onclick = async () => {
      showErrors({});
      try {
        await api('/api/admin/settings', { method: 'PATCH', body: {
          maxUploadMbProduction: Number(document.getElementById('s-max-prod').value),
          maxUploadMbSocial: Number(document.getElementById('s-max-social').value),
          maxSocialSec: Number(document.getElementById('s-max-sec').value),
          storageDriver: document.getElementById('s-driver').value,
        } });
        toast('Upload settings saved.', 'ok');
      } catch (e) { showErrors(e.errors); toast('Check the highlighted fields.', 'err'); }
    };
    document.getElementById('save-pass').onclick = async () => {
      showErrors({});
      const next = document.getElementById('p-next').value;
      try {
        await api('/api/admin/password', { method: 'POST', body: { current: document.getElementById('p-cur').value, next } });
        document.getElementById('p-cur').value = '';
        document.getElementById('p-next').value = '';
        toast('Password changed.', 'ok');
      } catch (e) {
        if (e.errors?.next) showErrors(e.errors);
        toast(e.error || 'Change failed.', 'err');
      }
    };
  })();
})();
