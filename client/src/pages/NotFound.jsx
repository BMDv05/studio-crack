import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import styles from './NotFound.module.css';

export default function NotFound() {
  return (
    <>
      <PageMeta
        title="Page not found — Double H Studio"
        description="This page does not exist. Head back to the Double H Studio home page."
      />
      <section className="section">
        <div className={`wrap ${styles.wrap}`}>
          <p className="eyebrow center">404</p>
          <h1>This reel is missing.</h1>
          <p className={styles.lede}>The page you asked for does not exist — it may have moved, or the link is old.</p>
          <div className={styles.ctaRow}>
            <Link className="btn btn-dark" to="/">Back to Home</Link>
            <Link className="btn btn-ghost-dark" to="/work">Explore Our Work</Link>
          </div>
        </div>
      </section>
    </>
  );
}
