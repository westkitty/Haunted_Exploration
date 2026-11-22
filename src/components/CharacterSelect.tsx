import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Dices,
  SlidersHorizontal,
} from 'lucide-react';
import { CHARACTERS } from '../engine/characters';
import { generateReadableSeed } from '../engine/seededRandom';
import type { ExpeditionSize } from '../engine/types';
import { CharacterPortrait } from './CharacterPortrait';
import { ExplorerSummaryCard } from './ExplorerSummaryCard';

interface CharacterSelectProps {
  initialSeed?: string;
  onBack: () => void;
  onPreviewCharacter?: (characterId: string) => void;
  onLaunch: (options: {
    characterId: string;
    displayName: string;
    seed: string;
    expeditionSize: ExpeditionSize;
  }) => void;
}

const PACING_OPTIONS: { id: ExpeditionSize; label: string; sub: string }[] = [
  { id: 'short', label: 'Short', sub: 'Dread 42' },
  { id: 'standard', label: 'Standard', sub: 'Dread 58' },
  { id: 'extended', label: 'Extended', sub: 'Dread 75' },
];

export const CharacterSelect: React.FC<CharacterSelectProps> = ({
  initialSeed,
  onBack,
  onPreviewCharacter,
  onLaunch,
}) => {
  const [selectedId, setSelectedId] = useState<string>(CHARACTERS[0].id);
  const [customName, setCustomName] = useState<string>('');
  const [seed, setSeed] = useState<string>(initialSeed || generateReadableSeed());
  const [expeditionSize, setExpeditionSize] = useState<ExpeditionSize>('standard');
  const [showOptions, setShowOptions] = useState<boolean>(Boolean(initialSeed));

  const selected = CHARACTERS.find((c) => c.id === selectedId) ?? CHARACTERS[0];

  useEffect(() => {
    onPreviewCharacter?.(selected.id);
  }, [selected.id, onPreviewCharacter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="fixed inset-0 z-30 flex pointer-events-none">
      {/* Left-edge scrim ONLY — right 60%+ stays openly live to show the 3D dollhouse & miniature preview */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(92deg, rgba(11,8,6,0.92) 0%, rgba(11,8,6,0.78) 36%, rgba(11,8,6,0.18) 62%, rgba(11,8,6,0.0) 86%)',
        }}
      />

      {/* Sleek Left Explorer Folio Drawer */}
      <aside className="relative z-10 w-full max-w-[445px] h-full overflow-y-auto px-6 sm:px-8 py-6 flex flex-col justify-between gap-6 pointer-events-auto">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="tactile-btn inline-flex items-center gap-1.5 text-xs font-body text-[#d6c6ac] hover:text-[#f7eedc] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#c99c52]" />
              Back to Study
            </button>
            <span className="font-body italic text-xs text-[#bda989]">Solo Expedition</span>
          </div>

          <div className="space-y-1 [text-shadow:0_2px_12px_rgba(0,0,0,0.95)]">
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#f7eedc] leading-none">
              Choose Your Explorer
            </h2>
            <p className="font-body italic text-xs text-[#cbb896]">
              Each guest enters Blackwood House with their own past and miniature figurine.
            </p>
          </div>

          {/* 6-Explorer Portrait Strip (instant live 3D miniature swap) */}
          <div className="grid grid-cols-3 gap-2">
            {CHARACTERS.map((char) => {
              const active = char.id === selected.id;
              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => setSelectedId(char.id)}
                  className={`tactile-btn text-left p-2 flex items-center gap-2 cursor-pointer border transition-colors ${
                    active
                      ? 'bg-[#281e16]/95 border-[#dfa953] shadow-[0_6px_18px_rgba(0,0,0,0.55)]'
                      : 'bg-[#15100c]/75 border-[#e4cfa8]/15 hover:border-[#c99c52]/55 hover:bg-[#1e1711]/85'
                  }`}
                >
                  <div className="shrink-0">
                    <CharacterPortrait character={char} size={36} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`font-display text-sm font-semibold leading-tight truncate ${
                        active ? 'text-[#f8eedb]' : 'text-[#dcd0bb]'
                      }`}
                    >
                      {char.name.split(' ')[0]}
                    </p>
                    <p className="font-body text-[10px] italic text-[#bfa986] truncate">
                      {char.title.replace(/^The\s+/i, '')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Explorer Editorial Folio (unified terminology: Health · Max Fear · 3 AP) */}
          <ExplorerSummaryCard character={selected} tone="parchment" />

          {/* Collapsible Expedition Seed & Pacing Options */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowOptions((v) => !v)}
              className="tactile-btn inline-flex items-center gap-2 text-xs font-body text-[#d6c4a4] hover:text-[#f7eedc] cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#c99c52]" />
              {showOptions ? 'Hide Expedition Options' : 'Expedition Seed & Pacing'}
              <span className="font-mono-num text-[11px] text-[#a9977a]">
                ({seed} · {expeditionSize})
              </span>
            </button>

            {showOptions && (
              <div className="walnut-panel p-4 space-y-3">
                <div>
                  <label className="block font-body text-xs text-[#cbb897] mb-1">
                    Custom Explorer Name
                  </label>
                  <input
                    type="text"
                    maxLength={36}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={selected.name}
                    className="w-full px-3 py-1.5 bg-[#120d0a] border border-[#c99c52]/35 text-sm text-[#f5ebd8] focus:outline-none focus:border-[#dfa953]"
                  />
                </div>

                <div>
                  <label className="block font-body text-xs text-[#cbb897] mb-1">
                    Mansion Seed
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={40}
                      value={seed}
                      onChange={(e) => setSeed(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-1.5 bg-[#120d0a] border border-[#c99c52]/35 font-mono-num text-xs tracking-wider text-[#f5ebd8] focus:outline-none focus:border-[#dfa953]"
                    />
                    <button
                      type="button"
                      onClick={() => setSeed(generateReadableSeed())}
                      aria-label="Roll New Seed"
                      title="Roll New Seed"
                      className="tactile-btn px-3 py-1.5 bg-[#231b14] border border-[#c99c52]/40 text-[#dfa953] hover:border-[#dfa953] cursor-pointer"
                    >
                      <Dices className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block font-body text-xs text-[#cbb897] mb-1.5">
                    Expedition Pacing (Revelation Threshold)
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PACING_OPTIONS.map((p) => {
                      const active = expeditionSize === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setExpeditionSize(p.id)}
                          className={`tactile-btn py-1.5 px-2 border text-center cursor-pointer ${
                            active
                              ? 'bg-[#c99c52] text-[#16100a] border-[#c99c52]'
                              : 'bg-[#120d0a] text-[#ded1ba] border-[#c99c52]/30 hover:border-[#c99c52]/70'
                          }`}
                        >
                          <span className={`block text-xs font-body ${active ? 'font-semibold' : ''}`}>
                            {p.label}
                          </span>
                          <span
                            className={`block font-mono-num text-[10px] ${
                              active ? 'text-[#281b0c]' : 'text-[#a89a84]'
                            }`}
                          >
                            {p.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Primary CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() =>
              onLaunch({
                characterId: selected.id,
                displayName: customName.trim() || selected.name,
                seed: seed.trim() || generateReadableSeed(),
                expeditionSize,
              })
            }
            className="tactile-btn group w-full flex items-center justify-between px-5 py-3.5 bg-gradient-to-b from-[#d8ad62] to-[#b3853e] text-[#16100a] hover:from-[#e6bd74] hover:to-[#c19147] cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,244,218,0.55)]"
          >
            <span className="font-display text-xl font-semibold tracking-tight">
              Enter Blackwood House
            </span>
            <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>
      </aside>
    </div>
  );
};
