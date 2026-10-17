import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';
import { Wordmark } from './Wordmark.jsx';
import PageLoader from './PageLoader.jsx';

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { pathname } = useLocation();
  const first = useRef(true);

  /* Branded 1s transition on every in-app navigation (skips first paint). */
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(t);
  }, [pathname]);
  return (
    <>
      {loading && <PageLoader />}
      <a className="skip" href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.nav}>
          <Link to="/" aria-label="Double H Studio home" onClick={() => setOpen(false)} className={styles.brandLink}>
            <Wordmark height={34} title="Double H Studio" />
          </Link>
          <button className={styles.menuBtn} aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
          <nav id="primary-nav" aria-label="Primary" className={`${styles.links} ${open ? styles.open : ''}`}>
            <NavLink to="/work" onClick={() => setOpen(false)}>Work</NavLink>
            <NavLink to="/about" onClick={() => setOpen(false)}>About</NavLink>
            <Link to="/book" className="btn btn-dark" onClick={() => setOpen(false)}>Book a Meeting</Link>
          </nav>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className="wrap">
          <div className={styles.foot}>
            <div className={styles.footBrand}>
              <Wordmark height={30} title="Double H Studio" />
              <span>studio@doubleh.example</span>
            </div>
            <nav aria-label="Footer">
              <Link to="/">Home</Link>
              <Link to="/work">Work</Link>
              <Link to="/about">About</Link>
              <Link to="/book">Book a Meeting</Link>
              <Link to="/privacy">Privacy</Link>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
