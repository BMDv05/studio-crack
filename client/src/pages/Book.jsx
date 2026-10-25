import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import { get, post, ApiError } from '../api/client.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import styles from './Book.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+\d][\d\s().-]{5,30}$/;
const DEFAULT_SERVICES = [
  'Brand Identity & Logo',
  'Architectural Visualization',
  'Interior & Spatial Design',
  'Cinematic Video & Showreel',
  'Web & Digital Presence',
];

/* Error codes returned by validate(); translated at display time via book.errors.* */
const ERROR_CODES = new Set([
  'full_name', 'name_long', 'email', 'phone', 'company_long', 'service',
  'desc_short', 'desc_long', 'date', 'date_past', 'time', 'meeting', 'consent',
]);

function todayIn(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/* Client-side rules mirror the server exactly (same messages, same order). */
function validate(v, services, timezone) {
  const e = {};
  if (v.full_name.trim().length < 2) e.full_name = 'full_name';
  else if (v.full_name.length > 100) e.full_name = 'name_long';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'email';
  if (v.phone && !PHONE_RE.test(v.phone)) e.phone = 'phone';
  if (v.company.length > 120) e.company = 'company_long';
  if (!v.service) e.service = 'service';
  else if (!services.includes(v.service)) e.service = 'service';
  if (v.description.trim().length < 10) e.description = 'desc_short';
  else if (v.description.length > 5000) e.description = 'desc_long';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.preferred_date)) e.preferred_date = 'date';
  else if (v.preferred_date < todayIn(timezone)) e.preferred_date = 'date_past';
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(v.preferred_time)) e.preferred_time = 'time';
  if (!['online', 'in_person'].includes(v.meeting_type)) e.meeting_type = 'meeting';
  if (!v.consent) e.consent = 'consent';
  return e;
}

export default function Book() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const loadedAt = useMemo(() => Date.now(), []);
  const submissionKey = useMemo(() => 'bk-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36), []);
  const [meta, setMeta] = useState({ services: DEFAULT_SERVICES, timezone: 'Asia/Amman', sla: '' });
  const [v, setV] = useState({
    full_name: '', email: '', phone: '', company: '', service: '', description: '',
    preferred_date: '', preferred_time: '', meeting_type: 'online', consent: false, website: '',
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const statusRef = useRef(null);

  useEffect(() => {
    get('/api/meta').then((d) => {
      if (d && d.ok) setMeta({ services: d.services, timezone: d.timezone, sla: d.sla });
    }).catch(() => {});
  }, []);

  const set = (field) => (e) => {
    const target = e.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setV((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
  };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const next = validate(v, meta.services, meta.timezone);
    setErrors(next);
    if (Object.keys(next).some((k) => next[k])) {
      setStatus(t('book.status.fix'));
      if (statusRef.current) statusRef.current.focus();
      return;
    }
    setBusy(true);
    setStatus(t('book.status.sending'));
    try {
      const body = { ...v, consent: v.consent ? 'true' : 'false', submissionKey, loadedAt };
      const data = await post('/api/booking', body);
      navigate(`/book/thank-you?reference=${encodeURIComponent(data.reference || '')}`, { replace: true });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.errors && Object.keys(err.errors).length) {
        setErrors(err.errors);
        setStatus(t('book.status.fix'));
      } else {
        setStatus(err instanceof ApiError ? err.message : t('book.status.error'));
      }
      if (statusRef.current) statusRef.current.focus();
    }
  }

  const min = todayIn(meta.timezone);
  /* Translate known error codes; server messages pass through as-is. */
  const err = (f) => (errors[f] ? (ERROR_CODES.has(errors[f]) ? t(`book.errors.${errors[f]}`) : String(errors[f])) : '');
  const invalid = (f) => (errors[f] ? 'invalid' : '');
  const svcLabel = (s) => (lang === 'ar' ? (t(`book.services.${s}`) !== `book.services.${s}` ? t(`book.services.${s}`) : s) : s);
  const slaText = () => {
    const sla = meta.sla || '';
    if (!sla) return t('book.slaDefault');
    const ar = t(`book.slaMap.${sla}`);
    return ar !== `book.slaMap.${sla}` ? ar : sla;
  };

  return (
    <>
      <PageMeta
        title={t('book.meta.title')}
        description={t('book.meta.description')}
      />
      <section className="section section-light">
        <div className="wrap">
          <div className={styles.page}>
            <header className={styles.head}>
              <p className="eyebrow center">{t('book.eyebrow')}</p>
              <h1>{t('book.title')}</h1>
              <p className={styles.lede}>
                {t('book.lede1')}
              </p>
              <div className={styles.notice} role="note">
                {t('book.notice1')}<strong>{t('book.notice2')}</strong>{t('book.notice3')}{slaText()}{t('book.notice4')}
              </div>
            </header>

            <form className={styles.form} onSubmit={submit} noValidate aria-describedby="formStatus">
              <div className={`field ${invalid('full_name')}`}>
                <label htmlFor="f-name">{t('book.fields.fullName')}</label>
                <input id="f-name" name="full_name" type="text" autoComplete="name" maxLength={100}
                  value={v.full_name} onChange={set('full_name')} aria-invalid={!!errors.full_name} />
                <span className="error" aria-live="polite">{err('full_name')}</span>
              </div>

              <div className={styles.two}>
                <div className={`field ${invalid('email')}`}>
                  <label htmlFor="f-email">{t('book.fields.email')}</label>
                  <input id="f-email" name="email" type="email" autoComplete="email" maxLength={254}
                    value={v.email} onChange={set('email')} aria-invalid={!!errors.email} />
                  <span className="error" aria-live="polite">{err('email')}</span>
                </div>
                <div className={`field ${invalid('phone')}`}>
                  <label htmlFor="f-phone">{t('book.fields.phone')}</label>
                  <input id="f-phone" name="phone" type="tel" autoComplete="tel" maxLength={32}
                    placeholder={t('common.optional')} value={v.phone} onChange={set('phone')} aria-invalid={!!errors.phone} />
                  <span className="error" aria-live="polite">{err('phone')}</span>
                </div>
              </div>

              <div className={styles.two}>
                <div className={`field ${invalid('company')}`}>
                  <label htmlFor="f-company">{t('book.fields.company')}</label>
                  <input id="f-company" name="company" type="text" autoComplete="organization" maxLength={120}
                    placeholder={t('common.optional')} value={v.company} onChange={set('company')} aria-invalid={!!errors.company} />
                  <span className="error" aria-live="polite">{err('company')}</span>
                </div>
                <div className={`field ${invalid('service')}`}>
                  <label htmlFor="f-service">{t('book.fields.service')}</label>
                  <select id="f-service" name="service" value={v.service} onChange={set('service')} aria-invalid={!!errors.service}>
                    <option value="">{t('book.fields.serviceChoose')}</option>
                    {meta.services.map((s) => <option key={s} value={s}>{svcLabel(s)}</option>)}
                  </select>
                  <span className="error" aria-live="polite">{err('service')}</span>
                </div>
              </div>

              <div className={`field ${invalid('description')}`}>
                <label htmlFor="f-desc">{t('book.fields.description')}</label>
                <textarea id="f-desc" name="description" maxLength={5000}
                  placeholder={t('book.fields.descPlaceholder')}
                  value={v.description} onChange={set('description')} aria-invalid={!!errors.description} />
                <span className="error" aria-live="polite">{err('description')}</span>
              </div>

              <div className={styles.two}>
                <div className={`field ${invalid('preferred_date')}`}>
                  <label htmlFor="f-date">{t('book.fields.date')}</label>
                  <input id="f-date" name="preferred_date" type="date" min={min}
                    value={v.preferred_date} onChange={set('preferred_date')} aria-invalid={!!errors.preferred_date} />
                  <span className="error" aria-live="polite">{err('preferred_date')}</span>
                </div>
                <div className={`field ${invalid('preferred_time')}`}>
                  <label htmlFor="f-time">{t('book.fields.time')}</label>
                  <input id="f-time" name="preferred_time" type="time"
                    value={v.preferred_time} onChange={set('preferred_time')} aria-invalid={!!errors.preferred_time} />
                  <span className="error" aria-live="polite">{err('preferred_time')}</span>
                </div>
              </div>
              <p className={styles.tzline}>{t('book.fields.tzline1')}<strong>{meta.timezone}</strong></p>

              <fieldset className={`field ${invalid('meeting_type')}`}>
                <legend>{t('book.fields.meetingType')}</legend>
                <div className={styles.cards}>
                  <label className={styles.card}>
                    <input type="radio" name="meeting_type" value="online" checked={v.meeting_type === 'online'} onChange={set('meeting_type')} />
                    <span>{t('book.fields.online')}</span>
                  </label>
                  <label className={styles.card}>
                    <input type="radio" name="meeting_type" value="in_person" checked={v.meeting_type === 'in_person'} onChange={set('meeting_type')} />
                    <span>{t('book.fields.inPerson')}</span>
                  </label>
                </div>
                <span className="error" aria-live="polite">{err('meeting_type')}</span>
              </fieldset>

              <div className={`field ${invalid('consent')}`}>
                <label className={styles.consent}>
                  <input type="checkbox" id="f-consent" name="consent" checked={v.consent} onChange={set('consent')} />
                  <span>
                    {t('book.fields.consent1')}
                  </span>
                </label>
                <span className="error" aria-live="polite">{err('consent')}</span>
              </div>

              {/* Honeypot: hidden from humans, tempting for bots */}
              <input className={styles.hp} type="text" name="website" tabIndex={-1} autoComplete="off"
                aria-hidden="true" value={v.website} onChange={set('website')} />

              <p className={styles.status} id="formStatus" role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>{status}</p>
              <div className={styles.actions}>
                <button className={`btn btn-light ${styles.submit}`} type="submit" disabled={busy}>
                  {busy ? t('book.fields.sending') : t('book.fields.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
