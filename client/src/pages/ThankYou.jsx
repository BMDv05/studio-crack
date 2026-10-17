import { Link, useSearchParams } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import styles from './ThankYou.module.css';

export default function ThankYou() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || '';
  return (
    <>
      <PageMeta
        title="Request received — Double H Studio"
        description="Your meeting request was received. The studio will reply by email."
        noindex
      />
      <section className="section section-light">
        <div className="wrap">
          <div className={`${styles.card} reveal is-visible`}>
            <div className={`${styles.badge}`} aria-hidden="true">✓</div>
            <p className="eyebrow center">Thank you</p>
            <h1>Your request is in.</h1>
            <p className={styles.lede}>
              We received your meeting request. <strong>The meeting is not yet confirmed</strong> —
              the studio replies by email, usually within 2 working days.
            </p>
            {reference ? (
              <p className={styles.ref}>
                Reference: <code>{reference}</code>
              </p>
            ) : null}
            <div className={styles.ctaRow}>
              <Link className="btn btn-light" to="/work">Explore Our Work</Link>
              <Link className="btn btn-ghost-light" to="/">Back to Home</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
