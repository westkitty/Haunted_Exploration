import React from 'react';
import { Compass, Shield } from 'lucide-react';
import { getItemById } from '../engine/itemsAndOmens';
import type { CharacterDef } from '../engine/types';
import { CharacterPortrait } from './CharacterPortrait';

const STAT_ROWS: { key: 'body' | 'grace' | 'insight' | 'nerve'; label: string }[] = [
  { key: 'body', label: 'Body' },
  { key: 'grace', label: 'Grace' },
  { key: 'insight', label: 'Insight' },
  { key: 'nerve', label: 'Nerve' },
];

interface ExplorerSummaryCardProps {
  character: CharacterDef;
  compact?: boolean;
  tone?: 'parchment' | 'walnut';
}

export const ExplorerSummaryCard: React.FC<ExplorerSummaryCardProps> = ({
  character,
  compact = false,
  tone = 'parchment',
}) => {
  const startingItem = getItemById(character.startingItemId);
  const isDark = tone === 'walnut';

  return (
    <div
      className={
        isDark
          ? 'p-4 bg-[#16110d] border border-[#c99c52]/32 space-y-3'
          : 'parchment-card animate-card-deal p-5 space-y-4'
      }
    >
      <div className="flex items-start gap-3.5">
        <CharacterPortrait character={character} size={compact ? 52 : 62} />
        <div className="min-w-0 flex-1">
          <h3
            className={`font-display ${compact ? 'text-xl' : 'text-2xl'} font-semibold leading-tight ${
              isDark ? 'text-[#f5ebd8]' : 'text-[#1d140c]'
            }`}
          >
            {character.name}
          </h3>
          <p
            className={`font-body italic text-xs ${
              isDark ? 'text-[#d4aa62]' : 'text-[#6f5129]'
            }`}
          >
            {character.title}
          </p>
          <p
            className={`font-mono-num text-xs mt-1 ${
              isDark ? 'text-[#bba98c]' : 'text-[#5c4529]'
            }`}
          >
            Health {character.maxHealth} · Max Fear {character.maxSanity} · 3 AP
          </p>
        </div>
      </div>

      {!compact && (
        <p
          className={`font-body text-sm leading-relaxed ${
            isDark ? 'text-[#dfd2bc]' : 'text-[#2b1e13]'
          }`}
        >
          {character.biography}
        </p>
      )}

      {/* 4-Trait Pip Grid */}
      <div
        className={`grid grid-cols-2 gap-x-5 gap-y-2 py-2.5 border-y ${
          isDark ? 'border-[#c99c52]/25' : 'border-[#8a6a3b]/35'
        }`}
      >
        {STAT_ROWS.map((row) => {
          const val = character.stats[row.key];
          return (
            <div key={row.key} className="flex items-center justify-between gap-2">
              <span
                className={`font-body text-xs ${
                  isDark ? 'text-[#cbb897]' : 'text-[#4a3620]'
                }`}
              >
                {row.label}
              </span>
              <div className="flex items-center gap-1" aria-label={`${row.label} ${val} of 5`}>
                {[1, 2, 3, 4, 5].map((pip) => (
                  <span
                    key={pip}
                    className={`w-2 h-2 rounded-full ${
                      pip <= val
                        ? isDark
                          ? 'bg-[#d4aa62]'
                          : 'bg-[#6e4c1f]'
                        : isDark
                          ? 'border border-[#c99c52]/40 bg-transparent'
                          : 'border border-[#8a6a3b]/45 bg-transparent'
                    }`}
                  />
                ))}
                <span
                  className={`font-mono-num text-xs font-semibold ml-1 w-3 text-right ${
                    isDark ? 'text-[#f5ebd8]' : 'text-[#2a1d11]'
                  }`}
                >
                  {val}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Passive, Weakness, Starting Relic */}
      <div
        className={`space-y-2 text-xs leading-relaxed ${
          isDark ? 'text-[#dfd2bc]' : 'text-[#2e2014]'
        }`}
      >
        <p>
          <Compass
            className={`inline w-3.5 h-3.5 mr-1.5 -mt-0.5 ${
              isDark ? 'text-[#89cbb9]' : 'text-[#2d6253]'
            }`}
          />
          <strong className={`font-semibold ${isDark ? 'text-[#9bd8c8]' : 'text-[#1d4a3d]'}`}>
            {character.passiveName}:
          </strong>{' '}
          {character.passiveDesc}
        </p>
        <p>
          <Shield
            className={`inline w-3.5 h-3.5 mr-1.5 -mt-0.5 ${
              isDark ? 'text-[#e5897d]' : 'text-[#8a2e26]'
            }`}
          />
          <strong className={`font-semibold ${isDark ? 'text-[#f0a599]' : 'text-[#7c2720]'}`}>
            {character.weaknessName}:
          </strong>{' '}
          {character.weaknessDesc}
        </p>
        {startingItem && (
          <p
            className={`pt-1.5 border-t ${
              isDark ? 'border-[#c99c52]/20' : 'border-[#8a6a3b]/25'
            }`}
          >
            <strong className={`font-semibold ${isDark ? 'text-[#e6be72]' : 'text-[#63441b]'}`}>
              Starts with {startingItem.name}:
            </strong>{' '}
            {startingItem.effectText}
          </p>
        )}
      </div>
    </div>
  );
};
