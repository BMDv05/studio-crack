import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageMeta from '../components/PageMeta.jsx';
import SplitText from '../components/SplitText.jsx';
import Reveal from '../components/Reveal.jsx';
import ParallaxImage from '../components/ParallaxImage.jsx';
import { lockScroll, unlockScroll } from '../hooks/useLenis.js';
import { get } from '../api/client.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import styles from './Work.module.css';

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23134c4b'/%3E%3Cstop offset='1' stop-color='%23161919'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3C/svg%3E";

function fmtDur(sec) {
  if (sec == null || !isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/* Lazy preview: loads the file on approach, muted-loops while in view. */
function Preview({ video }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const load = () => {
      if (!el.querySelector('source')) {
        const s = document.createElement('source');
        s.src = video.video_url;
        s.type = 'video/mp4';
        el.appendChild(s);
        el.load();
      }
    };
    if (!('IntersectionObserver' in window)) { load(); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { load(); el.play().catch(() => {}); }
          else el.pause();
        }
      },
      { rootMargin: '100px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [video.video_url]);
  return (
    <video ref={ref} muted loop playsInline preload="none" poster={video.thumbnail_url || FALLBACK_POSTER} aria-hidden="true" tabIndex={-1} />
  );
}

function Player({ video, onClose }) {
  const boxRef = useRef(null);
  const { t, lang } = useLang();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    lockScroll();
    const btn = boxRef.current && boxRef.current.querySelector('button');
    if (btn) btn.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockScroll();
    };
  }, [onClose]);
  if (!video) return null;
  const isAr = lang === 'ar';
  const displayTitle = (isAr && video.title_ar) ? video.title_ar : video.title;
  const displayDesc = (isAr && video.description_ar) ? video.description_ar : video.description;
  const meta = [displayDesc, video.client_name ? t('work.client', { name: video.client_name }) : '', (video.platforms || []).join(' · ')]
    .filter(Boolean).join('\n');
  return (
    <div className={styles.player}>
      <div className={styles.playerBack} onClick={onClose} />
      <div ref={boxRef} className={`${styles.playerBox} ${video.category === 'social' ? styles.narrow : ''}`} role="dialog" aria-modal="true" aria-label={t('work.playerAria')}>
        <button className={styles.playerX} onClick={onClose} aria-label={t('work.close')}>✕</button>
        <video src={video.video_url} poster={video.thumbnail_url || undefined} controls playsInline autoPlay />
        <div className={styles.playerMeta}>
          <h2>{displayTitle}</h2>
          <p style={{ whiteSpace: 'pre-line' }}>{meta}</p>
        </div>
      </div>
    </div>
  );
}

export default function Work() {
  const [params, setParams] = useSearchParams();
  const view = params.get('type') === 'social' ? 'social' : 'production';
  const [lists, setLists] = useState({ production: null, social: null });
  const [openId, setOpenId] = useState(null);
  const { t, lang } = useLang();
  const isAr = lang === 'ar';

  const load = useCallback(async (cat) => {
    try {
      const d = await get(`/api/videos?category=${cat}`);
      return (d.videos || []).filter((v) => v.video_url);
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let alive = true;
    if (lists[view] === null) {
      load(view).then((videos) => {
        if (!alive) return;
        setLists((prev) => ({ ...prev, [view]: videos }));
        const ld = document.getElementById('video-ld');
        if (ld) {
          ld.textContent = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList', name: 'Double H Studio portfolio',
            itemListElement: videos.map((v, i) => ({
              '@type': 'VideoObject', position: i + 1, name: (isAr && v.title_ar) ? v.title_ar : v.title,
              description: ((isAr && v.description_ar) ? v.description_ar : v.description) || v.title,
              ...(v.thumbnail_url ? { thumbnailUrl: v.thumbnail_url } : {}),
              contentUrl: v.video_url,
              ...((v.created_at || '').slice ? { uploadDate: String(v.created_at).slice(0, 10) } : {}),
              ...(v.duration_sec ? { duration: `PT${Math.round(v.duration_sec)}S` } : {}),
            })),
          });
        }
      });
    }
    return () => { alive = false; };
  }, [view, load, lists]);

  const list = lists[view] || [];
  const openVideo = openId ? [...(lists.production || []), ...(lists.social || [])].find((v) => v.id === openId) : null;
  const switchTo = (e, type) => {
    e.preventDefault();
    setParams(type === 'social' ? { type: 'social' } : {}, { replace: false });
  };

  return (
    <>
      <PageMeta title={t(`work.meta.${view}Title`)} description={t(`work.meta.${view}Desc`)} />
      <script type="application/ld+json" id="video-ld">{'{"@context":"https://schema.org","@type":"ItemList","name":"Double H Studio portfolio","itemListElement":[]}'}</script>
      <section className="section">
        <div className="wrap">
          <p className="eyebrow">{t('work.eyebrow')}</p>
          <SplitText as="h1" text={t('work.title')} />
          <Reveal as="p" className={styles.lede} delay={0.15}>{t('work.lede')}</Reveal>
          <nav className={styles.seg} aria-label={t('work.segAria')}>
            <a href="/work?type=production" aria-current={view === 'production'} onClick={(e) => switchTo(e, 'production')}>{t('work.production')}</a>
            <a href="/work?type=social" aria-current={view === 'social'} onClick={(e) => switchTo(e, 'social')}>{t('work.social')}</a>
          </nav>
          {view === 'production' ? (
            <div role="tabpanel" aria-label={t('work.panelProduction')}>
              {lists.production !== null && list.length === 0 ? (
                <div className={styles.empty}>{t('work.emptyProduction')}</div>
              ) : (
                <Reveal className={styles.grid} stagger>
                  {(list.length ? list : []).map((v) => {
                    const title = (isAr && v.title_ar) ? v.title_ar : v.title;
                    const desc = (isAr && v.description_ar) ? v.description_ar : v.description;
                    return (
                      <article className={styles.work} key={v.id}>
                        <ParallaxImage className={styles.media} strength={0.06}>
                          <button className={styles.playBtn} onClick={() => setOpenId(v.id)} aria-label={t('work.play', { title })}>
                            <Preview video={v} />
                          </button>
                        </ParallaxImage>
                        <div className={styles.meta}>
                          <h3>{title}</h3>
                          {desc ? <p>{desc}</p> : null}
                          <p className={styles.sub}>{[v.client_name ? t('work.client', { name: v.client_name }) : '', fmtDur(v.duration_sec)].filter(Boolean).join(' · ')}</p>
                        </div>
                      </article>
                    );
                  })}
                  {lists.production === null && <div className={styles.empty}>{t('work.loadingFilms')}</div>}
                </Reveal>
              )}
            </div>
          ) : (
            <div role="tabpanel" aria-label={t('work.panelSocial')}>
              {lists.social !== null && list.length === 0 ? (
                <div className={styles.empty}>{t('work.emptySocial')}</div>
              ) : (
                <Reveal className={styles.socialGrid} stagger>
                  {(list.length ? list : []).map((v) => {
                    const title = (isAr && v.title_ar) ? v.title_ar : v.title;
                    const desc = (isAr && v.description_ar) ? v.description_ar : v.description;
                    return (
                      <article className={styles.socialCard} key={v.id}>
                        <ParallaxImage className={styles.media} strength={0.06}>
                          <button className={styles.play} onClick={() => setOpenId(v.id)} aria-label={t('work.play', { title })}>
                            <Preview video={v} />
                          </button>
                        </ParallaxImage>
                        <div className={styles.meta}>
                          <h3>{title}</h3>
                          {desc ? <p>{desc}</p> : null}
                          {(v.platforms || []).length ? (
                            <div className={styles.chips}>{v.platforms.map((p) => <span className={styles.chip} key={p}>{p}</span>)}</div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                  {lists.social === null && <div className={styles.empty}>{t('work.loadingVideos')}</div>}
                </Reveal>
              )}
            </div>
          )}
          <div className={styles.ctaRow}>
            <Link className="btn btn-dark" to="/book">{t('common.book')}</Link>
            <Link className="btn btn-ghost-dark" to="/">{t('common.backHome')}</Link>
          </div>
        </div>
      </section>
      {openVideo && <Player video={openVideo} onClose={() => setOpenId(null)} />}
    </>
  );
}
