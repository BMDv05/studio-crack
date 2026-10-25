import { Link, useSearchParams } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import styles from './ThankYou.module.css';

export default function ThankYou() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || '';
  const { t } = useLang();
  return (
    <>
      <PageMeta
        title={t('thankYou.meta.title')}
        description={t('thankYou.meta.description')}
        noindex
      />
      <section className="section section-light">
        <div className="wrap">
          <div className={`${styles.card} reveal is-visible`}>
            <div className={`${styles.badge}`} aria-hidden="true">✓</div>
            <p className="eyebrow center">{t('thankYou.eyebrow')}</p>
            <h1>{t('thankYou.title')}</h1>
            <p className={styles.lede}>
              {t('thankYou.lede1')}<strong>{t('thankYou.lede2')}</strong>{t('thankYou.lede3')}
            </p>
            {reference ? (
              <p className={styles.ref}>
                {t('thankYou.reference')} <code>{reference}</code>
              </p>
            ) : null}
            <div className={styles.ctaRow}>
              <Link className="btn btn-light" to="/work">{t('common.exploreWork')}</Link>
              <Link className="btn btn-ghost-light" to="/">{t('common.backHome')}</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
