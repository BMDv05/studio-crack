import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import { get, post, ApiError } from '../api/client.js';
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
  if (v.full_name.trim().length < 2) e.full_name = 'Please enter your full name.';
  else if (v.full_name.length > 100) e.full_name = 'Name is too long (max 100 characters).';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid email address.';
  if (v.phone && !PHONE_RE.test(v.phone)) e.phone = 'Please enter a valid phone number.';
  if (v.company.length > 120) e.company = 'Company name is too long (max 120 characters).';
  if (!v.service) e.service = 'Please choose one of the available services.';
  else if (!services.includes(v.service)) e.service = 'Please choose one of the available services.';
  if (v.description.trim().length < 10) e.description = 'Please describe your project (at least 10 characters).';
  else if (v.description.length > 5000) e.description = 'Description is too long (max 5000 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.preferred_date)) e.preferred_date = 'Please choose a valid date (YYYY-MM-DD).';
  else if (v.preferred_date < todayIn(timezone)) e.preferred_date = 'Preferred date must not be in the past.';
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(v.preferred_time)) e.preferred_time = 'Please choose a valid time (HH:MM).';
  if (!['online', 'in_person'].includes(v.meeting_type)) e.meeting_type = 'Please choose Online or In-person.';
  if (!v.consent) e.consent = 'Please accept the privacy notice.';
  return e;
}

export default function Book() {
  const navigate = useNavigate();
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
      setStatus('Please fix the highlighted fields.');
      if (statusRef.current) statusRef.current.focus();
      return;
    }
    setBusy(true);
    setStatus('Sending your request…');
    try {
      const body = { ...v, consent: v.consent ? 'true' : 'false', submissionKey, loadedAt };
      const data = await post('/api/booking', body);
      navigate(`/book/thank-you?reference=${encodeURIComponent(data.reference || '')}`, { replace: true });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.errors && Object.keys(err.errors).length) {
        setErrors(err.errors);
        setStatus('Please fix the highlighted fields.');
      } else {
        setStatus(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
      if (statusRef.current) statusRef.current.focus();
    }
  }

  const min = todayIn(meta.timezone);
  const err = (f) => (errors[f] ? String(errors[f]) : '');
  const invalid = (f) => (errors[f] ? 'invalid' : '');

  return (
    <>
      <PageMeta
        title="Book a Meeting — Double H Studio"
        description="Request a meeting with Double H Studio: contact details, project information and preferred time. We reply by email."
      />
      <section className="section section-light">
        <div className="wrap">
          <p className="eyebrow">Book a Meeting</p>
          <h1>Request a meeting.</h1>
          <p className={styles.lede}>
            We collect only what we need to reply: your contact, project and preferred time. Data goes
            to the studio inbox and is handled per the <Link to="/privacy">privacy notice</Link>.
          </p>
          <div className={styles.notice} role="note">
            A submitted form is a <strong>request, not a confirmed appointment</strong>. The studio
            confirms manually by email, usually within {meta.sla || '2 working days'}.
          </div>

          <form className={styles.form} onSubmit={submit} noValidate aria-describedby="formStatus">
            <div className={`field ${invalid('full_name')}`}>
              <label htmlFor="f-name">Full name *</label>
              <input id="f-name" name="full_name" type="text" autoComplete="name" maxLength={100}
                value={v.full_name} onChange={set('full_name')} aria-invalid={!!errors.full_name} />
              <span className="error" aria-live="polite">{err('full_name')}</span>
            </div>

            <div className={styles.two}>
              <div className={`field ${invalid('email')}`}>
                <label htmlFor="f-email">Email address *</label>
                <input id="f-email" name="email" type="email" autoComplete="email" maxLength={254}
                  value={v.email} onChange={set('email')} aria-invalid={!!errors.email} />
                <span className="error" aria-live="polite">{err('email')}</span>
              </div>
              <div className={`field ${invalid('phone')}`}>
                <label htmlFor="f-phone">Phone number</label>
                <input id="f-phone" name="phone" type="tel" autoComplete="tel" maxLength={32}
                  placeholder="Optional" value={v.phone} onChange={set('phone')} aria-invalid={!!errors.phone} />
                <span className="error" aria-live="polite">{err('phone')}</span>
              </div>
            </div>

            <div className={styles.two}>
              <div className={`field ${invalid('company')}`}>
                <label htmlFor="f-company">Company / Brand name</label>
                <input id="f-company" name="company" type="text" autoComplete="organization" maxLength={120}
                  placeholder="Optional" value={v.company} onChange={set('company')} aria-invalid={!!errors.company} />
                <span className="error" aria-live="polite">{err('company')}</span>
              </div>
              <div className={`field ${invalid('service')}`}>
                <label htmlFor="f-service">Service required *</label>
                <select id="f-service" name="service" value={v.service} onChange={set('service')} aria-invalid={!!errors.service}>
                  <option value="">Choose a service…</option>
                  {meta.services.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="error" aria-live="polite">{err('service')}</span>
              </div>
            </div>

            <div className={`field ${invalid('description')}`}>
              <label htmlFor="f-desc">Project description *</label>
              <textarea id="f-desc" name="description" maxLength={5000}
                placeholder="Goals, scope, timeline, references…"
                value={v.description} onChange={set('description')} aria-invalid={!!errors.description} />
              <span className="error" aria-live="polite">{err('description')}</span>
            </div>

            <div className={styles.two}>
              <div className={`field ${invalid('preferred_date')}`}>
                <label htmlFor="f-date">Preferred meeting date *</label>
                <input id="f-date" name="preferred_date" type="date" min={min}
                  value={v.preferred_date} onChange={set('preferred_date')} aria-invalid={!!errors.preferred_date} />
                <span className="error" aria-live="polite">{err('preferred_date')}</span>
              </div>
              <div className={`field ${invalid('preferred_time')}`}>
                <label htmlFor="f-time">Preferred meeting time *</label>
                <input id="f-time" name="preferred_time" type="time"
                  value={v.preferred_time} onChange={set('preferred_time')} aria-invalid={!!errors.preferred_time} />
                <span className="error" aria-live="polite">{err('preferred_time')}</span>
              </div>
            </div>
            <p className={styles.tzline}>All times are in the studio's time zone: <strong>{meta.timezone}</strong></p>

            <fieldset className={`field ${invalid('meeting_type')}`}>
              <legend>Meeting type *</legend>
              <div className={styles.cards}>
                <label className={styles.card}>
                  <input type="radio" name="meeting_type" value="online" checked={v.meeting_type === 'online'} onChange={set('meeting_type')} />
                  <span>Online</span>
                </label>
                <label className={styles.card}>
                  <input type="radio" name="meeting_type" value="in_person" checked={v.meeting_type === 'in_person'} onChange={set('meeting_type')} />
                  <span>In-person</span>
                </label>
              </div>
              <span className="error" aria-live="polite">{err('meeting_type')}</span>
            </fieldset>

            <div className={`field ${invalid('consent')}`}>
              <label className={styles.consent}>
                <input type="checkbox" id="f-consent" name="consent" checked={v.consent} onChange={set('consent')} />
                <span>
                  I agree that my details are used to process this meeting request as described in the{' '}
                  <Link to="/privacy">privacy notice</Link> *
                </span>
              </label>
              <span className="error" aria-live="polite">{err('consent')}</span>
            </div>

            {/* Honeypot: hidden from humans, tempting for bots */}
            <input className={styles.hp} type="text" name="website" tabIndex={-1} autoComplete="off"
              aria-hidden="true" value={v.website} onChange={set('website')} />

            <p className={styles.status} id="formStatus" role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>{status}</p>
            <div>
              <button className="btn btn-light" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Submit request'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
