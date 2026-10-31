import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';
import { Wordmark } from './Wordmark.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAppReady } from '../hooks/useAppReady.jsx';
import Footer from './Footer.jsx';
import { gsap, ScrollTrigger, EASE, DUR, prefersReducedMotion } from '../lib/anim.js';

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useLang();
  const { ready } = useAppReady();

  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const panelRef = useRef(null);
  const firstNav = useRef(true);
  const navPlayed = useRef(false);

  /* Lock body scroll and pause smooth scroll while mobile menu is open. */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      window.__lenis?.stop();
    } else {
      document.body.style.overflow = '';
      window.__lenis?.start();
    }
    return () => {
      document.body.style.overflow = '';
      window.__lenis?.start();
    };
  }, [open]);

  /* Close drawer on route change. */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /* Close drawer on Escape key. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  /* Route transition: a teal panel covers the new route before paint, then
     wipes away (600ms). No flash of unstyled content. */
  useLayoutEffect(() => {
    if (firstNav.current) { firstNav.current = false; return undefined; }
    const el = panelRef.current;
    if (!el) return undefined;

    gsap.set(el, { autoAlpha: 1, scaleY: 1, transformOrigin: 'center top' });

    if (prefersReducedMotion()) {
      const quick = gsap.to(el, { autoAlpha: 0, duration: 0.3, ease: EASE.soft });
      return () => quick.kill();
    }
    const tl = gsap.timeline();
    tl.to(el, { scaleY: 0, duration: DUR.transition, ease: EASE.inOut })
      .set(el, { autoAlpha: 0 });
    return () => tl.kill();
  }, [pathname]);

  /* Nav slides down once the intro curtain opens. */
  useEffect(() => {
    if (!ready || navPlayed.current) return;
    navPlayed.current = true;
    const header = headerRef.current;
    if (!header || prefersReducedMotion()) return;
    gsap.fromTo(header, { yPercent: -100 }, { yPercent: 0, duration: 0.6, ease: EASE.out });
  }, [ready]);

  /* Nav: blurred background past 80px of scroll. */
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;

    const blurST = ScrollTrigger.create({
      start: 80,
      end: 'max',
      onToggle: (self) => header.classList.toggle(styles.scrolled, self.isActive),
    });

    return () => { blurST.kill(); };
  }, []);

  /* Footer slides up when it enters view. */
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer || prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(footer, { y: 60, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: EASE.out,
        scrollTrigger: { trigger: footer, start: 'top 95%', once: true },
      });
    }, footer);
    return () => ctx.revert();
  }, []);

  return (
    <>
      <div ref={panelRef} className={styles.transition} aria-hidden="true" />
      <a className="skip" href="#main">{t('common.skip')}</a>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.nav}>
          <Link to="/" aria-label={t('common.home')} onClick={() => setOpen(false)} className={styles.brandLink}>
            <Wordmark height={34} title="Double H Studio" />
          </Link>
          <div className={styles.navRight}>
            <LanguageSwitcher />
            <button
              className={`${styles.menuBtn} ${open ? styles.menuBtnOpen : ''}`}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? t('common.close') : t('common.menu')}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? (
                <span className={styles.iconClose} aria-hidden="true">✕</span>
              ) : (
                <span className={styles.iconBurger} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </button>
            <nav aria-label="Primary" className={styles.links}>
              <NavLink to="/work">{t('common.work')}</NavLink>
              <NavLink to="/about">{t('common.about')}</NavLink>
              <Link to="/book" className="btn btn-dark">{t('common.book')}</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Drawer: outside header so transform on header never traps or clips it */}
      <nav
        id="mobile-nav"
        aria-label="Mobile Navigation"
        className={`${styles.mobileDrawer} ${open ? styles.mobileDrawerOpen : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className={styles.mobileDrawerInner}>
          <NavLink to="/work" onClick={() => setOpen(false)}>{t('common.work')}</NavLink>
          <NavLink to="/about" onClick={() => setOpen(false)}>{t('common.about')}</NavLink>
          <Link to="/book" className="btn btn-dark" onClick={() => setOpen(false)}>{t('common.book')}</Link>
        </div>
      </nav>

      <main id="main">
        <Outlet />
      </main>
      <Footer ref={footerRef} />
    </>
  );
}
