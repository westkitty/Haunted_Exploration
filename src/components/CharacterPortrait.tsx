import React from 'react';
import type { CharacterDef } from '../engine/types';

/**
 * 19th-Century Victorian Copperplate Cameo Explorer Portrait
 * Features ornate oval brass filigree frame, chiaroscuro lighting, shaded facial features,
 * tailored Edwardian garments, and character-defining props.
 */
export const CharacterPortrait: React.FC<{
  character: CharacterDef;
  size?: number;
}> = ({ character, size = 64 }) => {
  const accent = character.accentColor;
  const coat = character.coatColor;
  const uid = `port_${character.id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className="shrink-0 drop-shadow-[0_3px_8px_rgba(0,0,0,0.55)]"
    >
      <defs>
        <radialGradient id={`${uid}_bg`} cx="45%" cy="35%" r="68%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
          <stop offset="55%" stopColor="#261c15" stopOpacity="0.96" />
          <stop offset="100%" stopColor="#0f0b08" stopOpacity="1" />
        </radialGradient>
        <linearGradient id={`${uid}_skin`} x1="34" y1="22" x2="58" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ecd8ba" />
          <stop offset="65%" stopColor="#cfaf86" />
          <stop offset="100%" stopColor="#9e7a55" />
        </linearGradient>
        <linearGradient id={`${uid}_brass`} x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f0cd84" />
          <stop offset="50%" stopColor="#a87c38" />
          <stop offset="100%" stopColor="#5e4119" />
        </linearGradient>
        <clipPath id={`${uid}_oval`}>
          <ellipse cx="48" cy="48" rx="39" ry="42" />
        </clipPath>
      </defs>

      {/* Ornate engraved Victorian oval brass bezel */}
      <ellipse cx="48" cy="48" rx="43" ry="45.5" fill="#16100b" stroke={`url(#${uid}_brass)`} strokeWidth="2.4" />
      <ellipse cx="48" cy="48" rx="40.5" ry="43" fill="none" stroke="#f5dfa8" strokeOpacity="0.35" strokeWidth="0.8" />
      {/* Cardinal brass filigree beads */}
      <circle cx="48" cy="3.5" r="2.1" fill="#e5be72" />
      <circle cx="48" cy="92.5" r="2.1" fill="#a87d39" />
      <circle cx="5" cy="48" r="1.8" fill="#c99d53" />
      <circle cx="91" cy="48" r="1.8" fill="#c99d53" />

      <g clipPath={`url(#${uid}_oval)`}>
        {/* Chiaroscuro atmospheric backdrop + subtle copperplate engraving crosshatch */}
        <rect x="6" y="4" width="84" height="88" fill={`url(#${uid}_bg)`} />
        <g stroke="#d8b982" strokeOpacity="0.08" strokeWidth="0.6">
          <line x1="10" y1="18" x2="86" y2="18" />
          <line x1="10" y1="24" x2="86" y2="24" />
          <line x1="10" y1="30" x2="86" y2="30" />
          <line x1="10" y1="36" x2="86" y2="36" />
          <line x1="10" y1="42" x2="86" y2="42" />
        </g>

        {/* Tailored Victorian Coat, Shoulders & Lapels */}
        <path
          d="M14 94 C16 68, 28 58, 48 58 C68 58, 80 68, 82 94 Z"
          fill={coat}
          stroke="#18100a"
          strokeWidth="1.2"
        />
        {/* Coat lapel highlight & shadow fold */}
        <path d="M35 59 L44 76 L31 82 L27 64 Z" fill="#0d0907" fillOpacity="0.35" />
        <path d="M61 59 L52 76 L65 82 L69 64 Z" fill="#0d0907" fillOpacity="0.35" />
        <path d="M36 58 L48 74 L60 58" fill="#ede2cd" stroke="#b8a586" strokeWidth="0.9" />
        {/* Silk cravat / collar pin */}
        <path d="M44 61 L48 73 L52 61 Z" fill={accent} fillOpacity="0.88" />
        <circle cx="48" cy="65" r="2.1" fill="#f3d189" stroke="#5e4119" strokeWidth="0.7" />

        {/* Neck & Chin Shadow */}
        <path d="M42 50 L42 61 C45 64, 51 64, 54 61 L54 50 Z" fill="#b7946d" />
        <ellipse cx="48" cy="52" rx="6.5" ry="3.5" fill="#5e4128" fillOpacity="0.45" />

        {/* Sculpted Head & Jawline */}
        <path
          d="M35.5 37 C35.5 24, 60.5 24, 60.5 37 C60.5 47, 54.5 54, 48 54.5 C41.5 54, 35.5 47, 35.5 37 Z"
          fill={`url(#${uid}_skin)`}
          stroke="#5e432a"
          strokeWidth="0.8"
        />

        {/* Expressive Engraved Facial Features (brows, shadowed eyes, nose bridge, mouth) */}
        <path d="M39.5 36.5 Q42.5 34.8 45.2 36.4" stroke="#362519" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M50.8 36.4 Q53.5 34.8 56.5 36.5" stroke="#362519" strokeWidth="1.25" strokeLinecap="round" />
        <ellipse cx="42.5" cy="39.2" rx="2.1" ry="1.35" fill="#f2eadb" />
        <ellipse cx="53.5" cy="39.2" rx="2.1" ry="1.35" fill="#f2eadb" />
        <circle cx="42.7" cy="39.2" r="1.15" fill="#231710" />
        <circle cx="53.3" cy="39.2" r="1.15" fill="#231710" />
        <path d="M48 38.2 L47.2 44.8 L49.6 45.4" stroke="#785639" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M43.8 48.6 Q48 50.2 52.2 48.4" stroke="#6b4430" strokeWidth="1.2" strokeLinecap="round" />

        {/* Character-Specific Hair, Headgear & Iconic Accents */}
        {character.silhouetteType === 'archivist' && (
          <>
            <path
              d="M34 38 C32 24, 42 19, 49 20 C59 21, 63 28, 61 38 C58 30, 52 27, 45 27 C39 27, 36 31, 34 38 Z"
              fill="#33241b"
            />
            <circle cx="42.5" cy="39.3" r="4.1" stroke="#dfb566" strokeWidth="1.3" fill="#ffffff" fillOpacity="0.1" />
            <circle cx="53.5" cy="39.3" r="4.1" stroke="#dfb566" strokeWidth="1.3" fill="#ffffff" fillOpacity="0.1" />
            <line x1="46.6" y1="39.2" x2="49.4" y2="39.2" stroke="#dfb566" strokeWidth="1.2" />
            <path d="M57.6 39.6 L60 56" stroke="#c59b56" strokeWidth="0.7" strokeDasharray="1.5 1.5" />
          </>
        )}

        {character.silhouetteType === 'medium' && (
          <>
            <path
              d="M33 44 C31 23, 41 16, 48 16 C55 16, 65 23, 63 44 L70 72 C61 66, 35 66, 26 72 Z"
              fill="#1b1526"
              fillOpacity="0.88"
              stroke="#6c5d82"
              strokeWidth="0.9"
            />
            <path
              d="M35.5 37 C35.5 24, 60.5 24, 60.5 37 C60.5 47, 54.5 54, 48 54.5 C41.5 54, 35.5 47, 35.5 37 Z"
              fill={`url(#${uid}_skin)`}
              fillOpacity="0.22"
            />
            <path d="M36 25 Q48 21 60 25" stroke="#85cbb9" strokeWidth="1.2" />
            <polygon points="48,20 51,24 48,28 45,24" fill="#8ad8c6" stroke="#244f46" strokeWidth="0.7" />
          </>
        )}

        {character.silhouetteType === 'locksmith' && (
          <>
            <path d="M31 29 L65 29 L60 18 C54 15, 42 15, 36 18 Z" fill="#2e241b" stroke="#8f6c39" strokeWidth="1" />
            <path d="M27 30 Q48 26 69 30" stroke="#c99c52" strokeWidth="2.1" strokeLinecap="round" />
            {/* Brass jeweler's loupe over right eye */}
            <circle cx="53.6" cy="39.3" r="4.5" stroke="#e5b864" strokeWidth="1.7" fill="#9cded4" fillOpacity="0.22" />
            <line x1="58" y1="38.5" x2="62" y2="35" stroke="#c99c52" strokeWidth="1.1" />
          </>
        )}

        {character.silhouetteType === 'physician' && (
          <>
            <path
              d="M34 36 C34 22, 42 19, 48 19 C56 19, 62 23, 62 36 C58 29, 53 26, 48 26 C42 26, 38 29, 34 36 Z"
              fill="#3d3530"
            />
            {/* Silver-streaked temples & trim mustache */}
            <path d="M35 33 L37 38" stroke="#c9c0b2" strokeWidth="1.4" />
            <path d="M61 33 L59 38" stroke="#c9c0b2" strokeWidth="1.4" />
            <path d="M42.5 47 Q48 45.2 53.5 47" stroke="#3d3530" strokeWidth="2.2" strokeLinecap="round" />
            {/* Brass stethoscope draped on collar */}
            <path d="M38 60 C38 73, 58 73, 58 60" stroke="#c99c52" strokeWidth="1.6" fill="none" />
          </>
        )}

        {character.silhouetteType === 'magician' && (
          <>
            {/* Silk Victorian Top Hat with crimson satin band */}
            <path d="M34 26 L36 8 C42 6.5, 54 6.5, 60 8 L62 26 Z" fill="#17141d" stroke="#8f6c39" strokeWidth="1" />
            <rect x="35.3" y="21.5" width="25.4" height="4.2" fill="#9e332d" />
            <path d="M25 27 Q48 23.5 71 27" stroke="#c99c52" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M44 47.5 Q48 46.2 52 47.5" stroke="#241b1a" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}

        {character.silhouetteType === 'heir' && (
          <>
            <path
              d="M33 41 C31 23, 41 18, 48 18 C55 18, 65 23, 63 41 C60 31, 55 26, 48 26 C41 26, 36 31, 33 41 Z"
              fill="#452a1d"
            />
            {/* Brass family diadem / heirloom pin */}
            <path d="M38 25 L43 19 L48 23 L53 19 L58 25" stroke="#e4bc70" strokeWidth="1.5" fill="none" />
            <circle cx="48" cy="21" r="1.6" fill="#c74b42" />
            <circle cx="48" cy="67" r="3.6" fill="#d9ad5f" stroke="#5e4119" strokeWidth="1" />
          </>
        )}
      </g>
    </svg>
  );
};

/**
 * Rich Copperplate Archival Engraving Illustrations for Event Cards
 */
export const EventMotifSvg: React.FC<{
  motif:
    | 'dining'
    | 'wall'
    | 'portrait'
    | 'clock'
    | 'mirror'
    | 'candle'
    | 'door'
    | 'bell'
    | 'book'
    | 'music';
}> = ({ motif }) => {
  return (
    <svg width="54" height="54" viewBox="0 0 60 60" fill="none" aria-hidden="true" className="shrink-0">
      {/* Double-ruled letterpress woodcut frame */}
      <rect x="2" y="2" width="56" height="56" fill="#e6d8bd" stroke="#6e4e24" strokeWidth="1.5" />
      <rect x="5" y="5" width="50" height="50" fill="#efe4cd" stroke="#967441" strokeWidth="0.8" />
      {/* Corner engraving ticks */}
      <path d="M5 11 L11 5 M55 11 L49 5 M5 49 L11 55 M55 49 L49 55" stroke="#8a6837" strokeWidth="0.9" />

      {motif === 'clock' && (
        <g stroke="#2c1d10" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="30" cy="30" r="18" fill="#f7efde" strokeWidth="1.8" />
          <circle cx="30" cy="30" r="15" strokeWidth="0.7" strokeDasharray="1.5 2.5" />
          <line x1="30" y1="30" x2="30" y2="17" strokeWidth="2.1" />
          <line x1="30" y1="30" x2="39" y2="34" stroke="#8f2c24" strokeWidth="1.8" />
          <circle cx="30" cy="30" r="2.2" fill="#2c1d10" />
          <text x="30" y="16" textAnchor="middle" fontSize="5" fill="#6e4e24" stroke="none" fontFamily="serif">XIII</text>
        </g>
      )}

      {motif === 'mirror' && (
        <g stroke="#2c1d10">
          <ellipse cx="30" cy="30" rx="14" ry="19" fill="#cfd8d6" strokeWidth="2.1" />
          <ellipse cx="30" cy="30" rx="11.5" ry="16.5" fill="none" stroke="#8b6836" strokeWidth="0.9" />
          <path d="M22 20 L34 38 M26 17 L37 33" stroke="#ffffff" strokeWidth="1.3" strokeOpacity="0.75" />
          <path d="M24 38 C26 32, 34 32, 36 38" stroke="#446260" strokeWidth="1.2" fill="none" />
          <circle cx="30" cy="28" r="3.4" stroke="#446260" strokeWidth="1.1" fill="none" />
        </g>
      )}

      {motif === 'bell' && (
        <g stroke="#2c1d10" strokeLinejoin="round">
          <path d="M18 40 C18 22, 42 22, 42 40 L46 44 L14 44 Z" fill="#c99c52" fillOpacity="0.45" strokeWidth="1.8" />
          <circle cx="30" cy="46.5" r="3" fill="#2c1d10" />
          <path d="M27 19 C27 14, 33 14, 33 19" strokeWidth="1.5" />
          <path d="M12 24 C15 18, 17 17, 21 15 M48 24 C45 18, 43 17, 39 15" stroke="#8f2c24" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}

      {motif === 'music' && (
        <g stroke="#2c1d10" strokeLinecap="round">
          <line x1="11" y1="22" x2="49" y2="22" stroke="#967441" strokeWidth="0.8" />
          <line x1="11" y1="28" x2="49" y2="28" stroke="#967441" strokeWidth="0.8" />
          <line x1="11" y1="34" x2="49" y2="34" stroke="#967441" strokeWidth="0.8" />
          <line x1="11" y1="40" x2="49" y2="40" stroke="#967441" strokeWidth="0.8" />
          <path d="M24 41 L24 18 L41 15 L41 37" strokeWidth="2" />
          <ellipse cx="20.5" cy="41.5" rx="4.2" ry="3" fill="#2c1d10" />
          <ellipse cx="37.5" cy="37.5" rx="4.2" ry="3" fill="#8f2c24" stroke="#8f2c24" />
        </g>
      )}

      {motif === 'door' && (
        <g stroke="#2c1d10" strokeLinejoin="round">
          <path d="M17 48 L17 22 C17 12, 43 12, 43 22 L43 48 Z" fill="#d3be98" strokeWidth="1.9" />
          <line x1="30" y1="14" x2="30" y2="48" strokeWidth="1.2" />
          <rect x="20" y="24" width="7" height="10" strokeWidth="0.9" fill="#e5d5b5" />
          <rect x="33" y="24" width="7" height="10" strokeWidth="0.9" fill="#e5d5b5" />
          <circle cx="35" cy="37" r="2" fill="#8f2c24" stroke="none" />
          <line x1="12" y1="48" x2="48" y2="48" strokeWidth="1.8" />
        </g>
      )}

      {motif === 'wall' && (
        <g stroke="#2c1d10">
          <rect x="11" y="14" width="38" height="32" fill="#dac9aa" strokeWidth="1.4" />
          <line x1="11" y1="24" x2="49" y2="24" strokeWidth="0.9" />
          <line x1="11" y1="35" x2="49" y2="35" strokeWidth="0.9" />
          <path d="M31 14 L28 24 L33 32 L27 46" stroke="#8f2c24" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M28 24 L21 28 M33 32 L40 30" stroke="#8f2c24" strokeWidth="1.1" />
        </g>
      )}

      {motif === 'dining' && (
        <g stroke="#2c1d10" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="30" cy="31" r="13" fill="#f7efde" strokeWidth="1.6" />
          <circle cx="30" cy="31" r="8.5" stroke="#8a6837" strokeWidth="0.9" />
          <line x1="12" y1="18" x2="12" y2="43" strokeWidth="1.6" />
          <path d="M10 18 L10 24 M14 18 L14 24" strokeWidth="1.1" />
          <path d="M48 18 L48 43 M48 18 C51 20, 51 26, 48 28" strokeWidth="1.6" />
        </g>
      )}

      {motif === 'candle' && (
        <g stroke="#2c1d10" strokeLinejoin="round">
          <rect x="25.5" y="26" width="9" height="19" fill="#f7efde" strokeWidth="1.6" />
          <path d="M25.5 29 C27 33, 28 33, 28.5 30 C29.5 34, 31 32, 34.5 29" stroke="#8a6837" strokeWidth="1" fill="none" />
          <path d="M30 11 C34 17, 34 22, 30 25 C26 22, 26 17, 30 11 Z" fill="#d9872b" stroke="#8f2c24" strokeWidth="1.2" />
          <path d="M17 46 L43 46 L39 49 L21 49 Z" fill="#c99c52" strokeWidth="1.5" />
        </g>
      )}

      {motif === 'portrait' && (
        <g stroke="#2c1d10">
          <rect x="15" y="11" width="30" height="38" fill="#d6c4a3" strokeWidth="1.9" />
          <rect x="18.5" y="14.5" width="23" height="31" fill="#2a1e15" stroke="#8a6837" strokeWidth="0.9" />
          <circle cx="30" cy="26" r="5.5" fill="#e5d4b6" stroke="none" />
          <path d="M21 44 C22 36, 38 36, 39 44 Z" fill="#6b302a" stroke="none" />
          <circle cx="28" cy="25.5" r="0.9" fill="#1a110a" stroke="none" />
          <circle cx="32" cy="25.5" r="0.9" fill="#1a110a" stroke="none" />
        </g>
      )}

      {motif === 'book' && (
        <g stroke="#2c1d10" strokeLinejoin="round">
          <path d="M12 18 C20 15, 27 17, 30 21 C33 17, 40 15, 48 18 L48 44 C40 41, 33 43, 30 46 C27 43, 20 41, 12 44 Z" fill="#f7efde" strokeWidth="1.7" />
          <line x1="30" y1="21" x2="30" y2="46" strokeWidth="1.4" />
          <path d="M16 25 L26 24 M16 30 L26 29 M16 35 L25 34 M34 24 L44 25 M34 29 L44 30 M34 34 L43 35" stroke="#8a6837" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
};
