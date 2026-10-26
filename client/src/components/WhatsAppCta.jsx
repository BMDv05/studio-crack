import { useLang } from '../i18n/LanguageContext.jsx';
import Reveal from './Reveal.jsx';
import styles from './WhatsAppCta.module.css';

/* Double H Studio — "Chat with us" WhatsApp card.
   Render inside a dark page: <WhatsAppCta /> brings its own .section + container
   spacing, so it lines up with the other sections on the page.

   Copy is { key, text }: `key` is looked up in the EN/AR dictionaries
   (src/i18n/translations.js), `text` is the English fallback. */

const COPY = {
  aria: { key: 'whatsapp.aria', text: 'WhatsApp contact' },
  eyebrow: { key: 'home.wa.eyebrow', text: 'Chat with us' },
  heading: { key: 'home.wa.title', text: 'Talk to the studio on WhatsApp.' },
  body: {
    key: 'whatsapp.lede',
    text: 'Quick questions, briefs and references. Message us directly. We usually reply within 1-2 working days.',
  },
  button: { key: 'home.wa.cta', text: 'WhatsApp the studio' },
  hint: { key: 'whatsapp.hint', text: 'Click to chat' },
};

/* EDIT: phone number, prefilled message and accessible labels live here. */
const WHATSAPP = {
  display: '+963 963 1020 26',
  tel: '+963963102026', // tel: links must be digits only
  number: '963963102026', // wa.me expects no + or spaces
  message: "Hello Double H Studio, I'd like to ask about a project.",
  buttonAria: { key: 'whatsapp.buttonAria', text: '{label} (opens WhatsApp in a new tab)' },
};

const CHAT_URL = `https://wa.me/${WHATSAPP.number}?text=${encodeURIComponent(WHATSAPP.message)}`;

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function WhatsAppCta() {
  const { t } = useLang();
  /* Falls back to the English literal in the data above if a key is missing. */
  const label = (entry, vars) => {
    const value = t(entry.key, vars);
    return value === entry.key ? entry.text : value;
  };

  return (
    <section className={`section on-dark ${styles.section}`} aria-label={label(COPY.aria)}>
      <div className={styles.container}>
        <div className={styles.card}>
          <Reveal className={styles.copy}>
            <p className={`eyebrow center ${styles.eyebrow}`}>{label(COPY.eyebrow)}</p>
            <h2 id="wa-heading" className={styles.heading}>{label(COPY.heading)}</h2>
            <p className={styles.body}>{label(COPY.body)}</p>
          </Reveal>

          <Reveal className={styles.action} delay={0.12}>
            <a
              className={styles.button}
              href={CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label(WHATSAPP.buttonAria, { label: label(COPY.button) })}
            >
              <WhatsAppIcon />
              <span>{label(COPY.button)}</span>
            </a>
            {/* dir=ltr keeps the number readable in Arabic (RTL) mode. */}
            <a className={styles.number} href={`tel:${WHATSAPP.tel}`} dir="ltr">{WHATSAPP.display}</a>
            <span className={styles.hint}>{label(COPY.hint)}</span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
