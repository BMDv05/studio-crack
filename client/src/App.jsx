import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Preloader from './components/Preloader.jsx';
import Cursor from './components/Cursor.jsx';
import ScrollProgress from './components/ScrollProgress.jsx';
import useLenis, { scrollToTop } from './hooks/useLenis.js';
import { AppReadyProvider, useAppReady } from './hooks/useAppReady.jsx';
import { ScrollTrigger } from './lib/anim.js';
import Home from './pages/Home.jsx';

/* The landing page (and its 3D opening) is what every visit starts on; the
   other views are split out so a first paint never waits for the whole site. */
const Work = lazy(() => import('./pages/Work.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Book = lazy(() => import('./pages/Book.jsx'));
const ThankYou = lazy(() => import('./pages/ThankYou.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

/* Suspense inside the route element keeps the shared Layout (header/footer)
   mounted while a page chunk arrives. */
function Page({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    scrollToTop(true);
  }, [pathname]);
  return null;
}

/* ScrollTrigger measures once fonts + images have settled. */
function RefreshScrollOnAssets() {
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    window.addEventListener('load', refresh);
    const t = window.setTimeout(refresh, 1200);
    return () => {
      window.removeEventListener('load', refresh);
      window.clearTimeout(t);
    };
  }, []);
  return null;
}

function Shell() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  const { setReady } = useAppReady();
  const [introDone, setIntroDone] = useState(() => {
    try { return sessionStorage.getItem('dh-intro') === '1'; } catch { return false; }
  });

  useLenis(true);

  /* Returning visit or admin: no intro, the hero plays straight away. */
  useEffect(() => {
    if (introDone || isAdmin) setReady(true);
  }, [introDone, isAdmin, setReady]);

  return (
    <>
      <ScrollProgress />
      <ScrollToTop />
      <RefreshScrollOnAssets />
      {!introDone && !isAdmin && (
        <Preloader
          onReveal={() => setReady(true)}
          onDone={() => setIntroDone(true)}
        />
      )}
      <Routes>
        <Route
          path="/admin/*"
          element={(
            <Suspense fallback={<div className="a-loading" role="status">Loading admin…</div>}>
              <AdminApp />
            </Suspense>
          )}
        />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/work" element={<Page><Work /></Page>} />
          <Route path="/about" element={<Page><About /></Page>} />
          <Route path="/book" element={<Page><Book /></Page>} />
          <Route path="/book/thank-you" element={<Page><ThankYou /></Page>} />
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Route>
      </Routes>
      <Cursor />
    </>
  );
}

export default function App() {
  return (
    <AppReadyProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AppReadyProvider>
  );
}
