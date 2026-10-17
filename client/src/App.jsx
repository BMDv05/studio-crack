import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Work from './pages/Work.jsx';
import About from './pages/About.jsx';
import Book from './pages/Book.jsx';
import ThankYou from './pages/ThankYou.jsx';
import Privacy from './pages/Privacy.jsx';
import NotFound from './pages/NotFound.jsx';

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
