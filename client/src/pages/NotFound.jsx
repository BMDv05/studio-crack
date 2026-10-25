import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import styles from './NotFound.module.css';

export default function NotFound() {
  const { t } = useLang();
  return (
    <>
      <PageMeta
        title={t('notFound.meta.title')}
        description={t('notFound.meta.description')}
      />
      <section className="section">
        <div className={`wrap ${styles.wrap}`}>
          <p className="eyebrow center">{t('notFound.eyebrow')}</p>
          <h1>{t('notFound.title')}</h1>
          <p className={styles.lede}>{t('notFound.lede')}</p>
          <div className={styles.ctaRow}>
            <Link className="btn btn-dark" to="/">{t('common.backHome')}</Link>
            <Link className="btn btn-ghost-dark" to="/work">{t('common.exploreWork')}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
