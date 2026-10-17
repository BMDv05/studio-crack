import { Wordmark } from './Wordmark.jsx';
import styles from './PageLoader.module.css';

/* Full-screen branded transition shown for ~1s on internal navigation. */
export default function PageLoader() {
  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className={styles.logo}>
        <Wordmark height={46} />
      </div>
      <div className={styles.bar} aria-hidden="true"><span /></div>
    </div>
  );
}
