import PageMeta from '../components/PageMeta.jsx';
import styles from './Privacy.module.css';

export default function Privacy() {
  return (
    <>
      <PageMeta
        title="Privacy notice — Double H Studio"
        description="How Double H Studio uses and keeps booking-request data."
      />
      <section className="section section-light">
        <div className={`wrap ${styles.wrap}`}>
          <p className="eyebrow">Privacy notice</p>
          <h1>How we use booking data.</h1>
          <ul className={styles.list}>
            <li><strong>Why:</strong> to review your meeting request and reply by email.</li>
            <li><strong>What:</strong> only the fields on the booking form; phone and company are optional.</li>
            <li><strong>Who:</strong> the studio inbox. We never sell personal data.</li>
            <li><strong>Consent:</strong> the required checkbox records the time of consent.</li>
            <li><strong>Retention:</strong> unconfirmed requests are deleted after 12 months; confirmed client records are kept only as long as needed for the relationship.</li>
            <li><strong>Your rights:</strong> ask for correction or deletion by emailing the studio with your reference number.</li>
            <li><strong>Analytics:</strong> none by default; any future analytics will be privacy-friendly and cookie-light.</li>
          </ul>
          <p className={styles.note}>
            <em>Note: applicable privacy law depends on where the studio and clients are located.
            Have this notice reviewed against the rules that apply to the studio.</em>
          </p>
        </div>
      </section>
    </>
  );
}
