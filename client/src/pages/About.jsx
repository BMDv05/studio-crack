import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import { useRevealRoot } from '../hooks/useReveal.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import styles from './About.module.css';

const CRAFT_KEYS = ['brand', 'arch', 'video', 'social', 'digital'];
const VALUE_KEYS = ['v1', 'v2', 'v3'];

export default function About() {
  const rootRef = useRevealRoot();
  const { t, lang } = useLang();
  const isArabic = lang === 'ar';
  return (
    <>
      <PageMeta
        title={t('about.meta.title')}
        description={t('about.meta.description')}
      />
      <div ref={rootRef} className={isArabic ? 'about-rtl' : ''}>
        <section className="section about-section">
          <div className="wrap">
            {/* ABOUT label and headline */}
            <div className="about-header">
              <span className="about-label">ABOUT</span>
              <hr className="about-hr" />
              <h1 className="about-title">{t('about.title')}</h1>
              <hr className="about-hr" />
            </div>
            <p className="about-lede">{t('about.lede')}</p>

            {/* Services grid - 5 cards in 3-2 layout */}
            <div className="services-grid">
              {['brand', 'arch', 'video', 'social', 'digital'].map((key, i) => (
                <div key={key} className="service-card">
                  <h3>{t(`about.crafts.${key}.h`)}</h3>
                  <p>{t(`about.crafts.${key}.p`)}</p>
                </div>
              ))}
            </div>

            {/* How We Work section */}
            <section className="section section-light">
              <div className="wrap">
                <p className="eyebrow">{t('about.howEyebrow')}</p>
                <h2>{t('about.howTitle')}</h2>
                <div className="principles-grid">
                  {[['v1', 'v2', 'v3'].map((key, i) => (
                    <div key={key} className="principle-card">
                      <h3>{t(`about.values.${key}.h`)}</h3>
                      <p>{t(`about.values.${key}.p`)}</p>
                    </div>
                  ))]}
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </>
  );
}