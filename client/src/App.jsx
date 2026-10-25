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
import Work from './pages/Work.jsx';
import About from './pages/About.jsx';
import Book from './pages/Book.jsx';
import ThankYou from './pages/ThankYou.jsx';
import NotFound from './pages/NotFound.jsx';

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

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
          <Route path="/work" element={<Work />} />
          <Route path="/about" element={<About />} />
          <Route path="/book" element={<Book />} />
          <Route path="/book/thank-you" element={<ThankYou />} />
          <Route path="*" element={<NotFound />} />
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
