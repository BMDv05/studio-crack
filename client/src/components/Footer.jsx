import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from './Wordmark.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { scrollToTop } from '../hooks/useLenis.js';
import { prefersReducedMotion } from '../lib/anim.js';
import styles from './Footer.module.css';

/* Double H Studio — site footer.
   Rendered once in src/components/Layout.jsx, so every public page gets it.
   4 columns on desktop, 2 on tablet, 1 on mobile.

   Every string below is { key, text }: `key` is looked up in the EN/AR dictionaries
   (src/i18n/translations.js) and `text` is the English fallback used if the key is
   ever missing. Edit copy here or in the dictionary — both work. */

const TAGLINE = { key: 'footer.tagline', text: 'Cinematic stories, built environments.' };

const NAV_COLUMN = {
  heading: { key: 'footer.navigate', text: 'Navigate' },
  navAria: { key: 'footer.navAria', text: 'Footer' },
  links: [
    { to: '/', key: 'common.home', text: 'Home' },
    { to: '/work', key: 'common.work', text: 'Work' },
    { to: '/about', key: 'common.about', text: 'About' },
    { to: '/book', key: 'common.book', text: 'Book a Meeting' },
  ],
};

/* EDIT: contact details. Location and hours are placeholders — confirm them. */
const CONTACT_COLUMN = {
  heading: { key: 'footer.contact', text: 'Contact' },
  /* dir: 'ltr' on the Latin/number rows keeps them readable in Arabic (RTL) mode. */
  items: [
    { text: 'studio@doubleh.example', href: 'mailto:studio@doubleh.example', dir: 'ltr' },
    { text: '+963 963 1020 26', href: 'tel:+963963102026', dir: 'ltr' },
    { key: 'footer.location', text: 'Amman, Jordan' },
    { key: 'footer.hours', text: 'Sun–Thu · 09:00–18:00 (GMT+3)' },
  ],
};

/* EDIT: legal routes. /terms does not exist in the router yet. */
const LEGAL_COLUMN = {
  heading: { key: 'footer.legal', text: 'Legal' },
  links: [
    { to: '/terms', key: 'footer.terms', text: 'Terms' },
  ],
};

const BOTTOM = {
  toTop: { key: 'footer.toTop', text: 'Back to top' },
  copyright: { key: 'footer.copyright', text: '© {year} Double H Studio. All rights reserved.' },
};

const BRAND = { key: 'footer.brandAria', text: 'Double H Studio — home' };

/* EDIT: replace with your real profile URLs. */
const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/doubleh.studio', Icon: InstagramIcon },
  { label: 'Behance', href: 'https://www.behance.net/doublehstudio', Icon: BehanceIcon },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/double-h-studio', Icon: LinkedInIcon },
];

function Icon({ children }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function InstagramIcon() {
  return <Icon><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" /></Icon>;
}

function BehanceIcon() {
  return <Icon><path d="M16.969 16.927a2.561 2.561 0 0 0 1.901.677 2.501 2.501 0 0 0 1.531-.475c.362-.235.636-.584.779-.99h2.585a5.091 5.091 0 0 1-1.9 2.896 5.292 5.292 0 0 1-3.091.88 5.839 5.839 0 0 1-2.284-.433 4.871 4.871 0 0 1-1.723-1.211 5.657 5.657 0 0 1-1.08-1.874 7.057 7.057 0 0 1-.383-2.393c-.005-.8.129-1.595.396-2.349a5.313 5.313 0 0 1 5.088-3.604 4.87 4.87 0 0 1 2.376.563c.661.362 1.231.87 1.668 1.485a6.2 6.2 0 0 1 .943 2.133c.194.821.263 1.666.205 2.508h-7.699c-.063.79.184 1.574.688 2.187ZM6.947 4.084a8.065 8.065 0 0 1 1.928.198 4.29 4.29 0 0 1 1.49.638c.418.303.748.711.958 1.182.241.579.357 1.203.341 1.83a3.506 3.506 0 0 1-.506 1.961 3.726 3.726 0 0 1-1.503 1.287 3.588 3.588 0 0 1 2.027 1.437c.464.747.697 1.615.67 2.494a4.593 4.593 0 0 1-.423 2.032 3.945 3.945 0 0 1-1.163 1.413 5.114 5.114 0 0 1-1.683.807 7.135 7.135 0 0 1-1.928.259H0V4.084h6.947Zm-.235 12.9c.308.004.616-.029.916-.099a2.18 2.18 0 0 0 .766-.332c.228-.158.411-.371.534-.619.142-.317.208-.663.191-1.009a2.08 2.08 0 0 0-.642-1.715 2.618 2.618 0 0 0-1.696-.505h-3.54v4.279h3.471Zm13.635-5.967a2.13 2.13 0 0 0-1.654-.619 2.336 2.336 0 0 0-1.163.259 2.474 2.474 0 0 0-.738.62 2.359 2.359 0 0 0-.396.792c-.074.239-.12.485-.137.734h4.769a3.239 3.239 0 0 0-.679-1.785l-.002-.001Zm-13.813-.648a2.254 2.254 0 0 0 1.423-.433c.399-.355.607-.88.56-1.413a1.916 1.916 0 0 0-.178-.891 1.298 1.298 0 0 0-.495-.533 1.851 1.851 0 0 0-.711-.274 3.966 3.966 0 0 0-.835-.073H3.241v3.631h3.293v-.014ZM21.62 5.122h-5.976v1.527h5.976V5.122Z" /></Icon>;
}

function LinkedInIcon() {
  return (
    <Icon>
      <path d="M6.94 5a1.94 1.94 0 1 1-3.88 0 1.94 1.94 0 0 1 3.88 0ZM3.4 8.4h3.2v12H3.4v-12Zm5.5 0h3.06v1.64h.05c.43-.77 1.48-1.58 3.05-1.58 3.26 0 3.86 2.05 3.86 4.72v7.22h-3.2v-6.4c0-1.53-.03-3.5-2.13-3.5-2.14 0-2.47 1.66-2.47 3.38v6.52H8.9v-12Z" />
    </Icon>
  );
}

/* Smooth scroll to the top. Uses Lenis when it is running and jumps instantly
   when the visitor prefers reduced motion. */
function backToTop() {
  scrollToTop(prefersReducedMotion());
}

/* forwardRef so the layout's scroll-triggered entrance animation can target
   the <footer> element itself (gsap.fromTo(footerRef.current, …)). */
const Footer = forwardRef(function Footer(_props, ref) {
  const { t } = useLang();
  /* Falls back to the English literal in the data above if a key is missing. */
  const label = (entry, vars) => {
    if (!entry.key) return entry.text;
    const value = t(entry.key, vars);
    return value === entry.key ? entry.text : value;
  };
  const year = new Date().getFullYear();

  return (
    <footer ref={ref} className={`on-dark ${styles.footer}`}>
      <div className={styles.container}>
        <div className={styles.grid}>
          <div className={styles.brandColumn}>
            <Link to="/" className={styles.brandLink} aria-label={label(BRAND)}>
              <Wordmark height={30} title="Double H Studio" />
            </Link>
            <p className={styles.tagline}>{label(TAGLINE)}</p>
            <ul className={styles.socials}>
              {SOCIAL_LINKS.map(({ label: social, href, Icon: SocialIcon }) => (
                <li key={social}>
                  <a
                    className={styles.social}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${social} (opens in a new tab)`}
                  >
                    <SocialIcon />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav className={styles.column} aria-label={label(NAV_COLUMN.navAria)}>
            <h2 className={styles.heading}>{label(NAV_COLUMN.heading)}</h2>
            <ul className={styles.list}>
              {NAV_COLUMN.links.map((link) => (
                <li key={link.to}>
                  <Link className={styles.link} to={link.to}>{label(link)}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.column}>
            <h2 className={styles.heading}>{label(CONTACT_COLUMN.heading)}</h2>
            <ul className={styles.list}>
              {CONTACT_COLUMN.items.map((item) => (
                <li key={item.text}>
                  {item.href
                    ? <a className={styles.link} href={item.href} dir={item.dir}>{label(item)}</a>
                    : <span className={styles.plain} dir={item.dir}>{label(item)}</span>}
                </li>
              ))}
            </ul>
          </div>

          <nav className={styles.column} aria-label={label(LEGAL_COLUMN.heading)}>
            <h2 className={styles.heading}>{label(LEGAL_COLUMN.heading)}</h2>
            <ul className={styles.list}>
              {LEGAL_COLUMN.links.map((link) => (
                <li key={link.to}>
                  <Link className={styles.link} to={link.to}>{label(link)}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>{label(BOTTOM.copyright, { year })}</p>
          <button type="button" className={styles.toTop} onClick={backToTop}>
            {label(BOTTOM.toTop)} <span aria-hidden="true">↑</span>
          </button>
        </div>
      </div>
    </footer>
  );
});

export default Footer;
