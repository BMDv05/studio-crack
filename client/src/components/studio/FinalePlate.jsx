/* The final scene of the lens crossing.

   This is the same editorial plate used in the about hero, framed for the
   screen instead of the page. The photograph is the supplied still, shown
   whole at its 16:9 ratio: no zoom, no crop, no second camera. The aperture
   opens over it. The only motion is the reveal (darkness, focus, UI opacity),
   all written by StudioBlueprintAnimation from the same scroll progress. */

import { useLang } from "../../i18n/LanguageContext.jsx";
import s from "./FinalePlate.module.css";

export default function FinalePlate() {
  const { t } = useLang();

  return (
    <div className={s.stage}>
      <figure className={s.plate}>
        <img
          className={s.image}
          src="/video/studio-build-still.webp"
          alt={t("about.hero.plateAlt")}
          width="1280"
          height="720"
          loading="eager"
          decoding="async"
          draggable="false"
        />

        <span className={s.grade} aria-hidden="true" />
        <span className={s.grain} aria-hidden="true" />
        <span className={s.darkness} aria-hidden="true" />

        <span className={s.labelTop}>{t("about.hero.plate")}</span>

        <span className={`${s.corner} ${s.tl}`} aria-hidden="true" />
        <span className={`${s.corner} ${s.tr}`} aria-hidden="true" />
        <span className={`${s.corner} ${s.bl}`} aria-hidden="true" />
        <span className={`${s.corner} ${s.br}`} aria-hidden="true" />

        <figcaption className={s.caption}>
          <span className={s.captionLabel}>{t("about.dossier.eyebrow")}</span>
          <p>{t("about.hero.plateCaption")}</p>
        </figcaption>

        <span className={s.meta}>{t("about.hero.plateMeta")}</span>
      </figure>
    </div>
  );
}
