import { useLang } from '../i18n/LanguageContext.jsx';
import styles from './LanguageSwitcher.module.css';

/* EN / عربي segmented toggle with a sliding pill.
   Implemented as a radiogroup so screen readers announce the state properly. */
export default function LanguageSwitcher({ theme }) {
  const { lang, setLang, t } = useLang();
  return (
    <div className={styles.switch} data-theme={theme} role="radiogroup" aria-label={t('switcher.label')}>
      <span className={styles.pill} data-lang={lang} aria-hidden="true" />
      <button
        type="button"
        role="radio"
        aria-checked={lang === 'en'}
        className={lang === 'en' ? styles.active : ''}
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={lang === 'ar'}
        className={`${styles.arabicLabel} ${lang === 'ar' ? styles.active : ''}`}
        onClick={() => setLang('ar')}
      >
        عربي
      </button>
    </div>
  );
}
