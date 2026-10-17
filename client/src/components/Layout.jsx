import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import styles from './Layout.module.css';

function Wordmark({ light }) {
  return (
    <span className={styles.brand}>
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill={light ? '#e6ecec' : '#12393a'} />
        <text x="32" y="43" textAnchor="middle" fontFamily="Poppins,sans-serif" fontWeight="700" fontSize="30" fill={light ? '#12393a' : '#e6ecec'}>H</text>
      </svg>
      <span>Double H<small>— STUDIO —</small></span>
    </span>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.nav}>
          <Link to="/" aria-label="Double H Studio home" onClick={() => setOpen(false)}>
            <Wordmark light />
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
            <div><strong>Double H Studio</strong><br /><span>studio@doubleh.example</span></div>
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
