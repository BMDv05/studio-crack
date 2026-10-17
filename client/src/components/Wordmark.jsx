import React from 'react';

/* Double H Studio — official wordmark, rebuilt as vector from the brand lockup.
   Uses currentColor so it works on dark (mist) and light (ink) surfaces alike.
   Full lockup: "Double H" (small caps + signature angled-cut H) over "— STUDIO —". */

const WORDMARK_W = 476;
const WORDMARK_H = 136;

export function Wordmark({ height = 36, className, style, title }) {
  const width = (height * WORDMARK_W) / WORDMARK_H; /* ~3.5:1 */
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${WORDMARK_W} ${WORDMARK_H}`}
      className={className}
      style={style}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {/* D — full cap */}
      <path
        fillRule="evenodd"
        d="M0,0 H40 C58,0 72,20 72,50 C72,80 58,100 40,100 H0 Z M15,15 V85 H39 C50,85 57,70 57,50 C57,30 50,15 39,15 Z"
      />
      {/* O — small cap */}
      <g transform="translate(82,0)">
        <path
          fillRule="evenodd"
          d="M30,28 C47,28 60,43 60,64 C60,85 47,100 30,100 C13,100 0,85 0,64 C0,43 13,28 30,28 Z
             M30,43 C37,43 45,52 45,64 C45,76 37,85 30,85 C23,85 15,76 15,64 C15,52 23,43 30,43 Z"
        />
      </g>
      {/* U — small cap */}
      <g transform="translate(152,0)">
        <path d="M0,28 H15 V68 C15,77 21,84 29,84 C37,84 43,77 43,68 V28 H58 V68 C58,88 46,100 29,100 C12,100 0,88 0,68 Z" />
      </g>
      {/* B — small cap */}
      <g transform="translate(220,0)">
        <path
          fillRule="evenodd"
          d="M0,28 H30 C42,28 48,34 48,45 C48,52 45,57 39,60 C47,62 53,68 53,78 C53,91 43,100 30,100 H0 Z
             M15,42 H29 C34,42 36,45 36,51 C36,56 34,60 29,60 H15 Z
             M15,72 H30 C36,72 39,76 39,79 C39,83 36,86 30,86 H15 Z"
        />
      </g>
      {/* L — small cap */}
      <g transform="translate(280,0)">
        <path d="M0,28 H14 V86 H42 V100 H0 Z" />
      </g>
      {/* E — small cap */}
      <g transform="translate(332,0)">
        <path d="M0,28 H44 V42 H14 V57 H40 V71 H14 V86 H44 V100 H0 Z" />
      </g>
      {/* H — full cap with signature angled top-left cut */}
      <g transform="translate(406,0)">
        <path d="M0,18 L14,0 V43 H56 V0 H70 V100 H56 V57 H14 V100 H0 Z" />
      </g>
      {/* — STUDIO — rule line */}
      <rect x="0" y="124" width="88" height="3.5" rx="1.75" />
      <rect x="388" y="124" width="88" height="3.5" rx="1.75" />
      <text
        x="238"
        y="134"
        textAnchor="middle"
        textLength="230"
        lengthAdjust="spacing"
        fontFamily="Poppins, sans-serif"
        fontWeight="500"
        fontSize="23"
      >
        STUDIO
      </text>
    </svg>
  );
}

/* Bare angled-cut H glyph — used for the favicon and the admin badge. */
export function HMark({ size = 17, className, style }) {
  return (
    <svg
      width={(size * 70) / 100}
      height={size}
      viewBox="0 0 70 100"
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0,18 L14,0 V43 H56 V0 H70 V100 H56 V57 H14 V100 H0 Z" />
    </svg>
  );
}
