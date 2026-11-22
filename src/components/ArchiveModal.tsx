import React, { useState } from 'react';
import { BookOpen, RotateCcw, X } from 'lucide-react';
import type { ExpeditionArchiveEntry } from '../engine/types';
import { ModalShell } from './ModalShell';

interface ArchiveModalProps {
  entries: ExpeditionArchiveEntry[];
  onReplaySeed: (seed: string) => void;
  onClose: () => void;
}

const MiniRouteSvg: React.FC<{
  points: { x: number; z: number; floor: number; name: string }[];
}> = ({ points }) => {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  const coords = points.map((p) => ({
    cx: 12 + ((p.x - minX) / spanX) * 76,
    cy: 12 + ((p.z - minZ) / spanZ) * 40,
    floor: p.floor,
  }));

  const pathD = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.cx.toFixed(1)} ${c.cy.toFixed(1)}`)
    .join(' ');

  return (
    <svg width="100" height="64" viewBox="0 0 100 64" className="bg-[#120d0a] border border-[#c59b56]/30 shrink-0">
      <path d={pathD} fill="none" stroke="#c59b56" strokeWidth="1.6" strokeOpacity="0.85" />
      {coords.map((c, idx) => (
        <circle
          key={idx}
          cx={c.cx}
          cy={c.cy}
          r={idx === coords.length - 1 ? 3 : 2}
          fill={c.floor === 1 ? '#e2a84b' : c.floor === -1 ? '#7fb5a6' : '#f2e8d5'}
        />
      ))}
    </svg>
  );
};

export const ArchiveModal: React.FC<ArchiveModalProps> = ({
  entries,
  onReplaySeed,
  onClose,
}) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  return (
    <ModalShell
      ariaLabelledBy="archive-modal-title"
      onClose={onClose}
      backdropClassName="bg-[#080605]/74"
    >
      <div className="walnut-panel animate-card-deal relative max-w-3xl w-full p-6 max-h-[88vh] flex flex-col">
        {/* Engraved brass corner hairlines */}
        <span className="pointer-events-none absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t border-l border-[#c99c52]/45" />
        <span className="pointer-events-none absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t border-r border-[#c99c52]/45" />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b border-l border-[#c99c52]/45" />
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b border-r border-[#c99c52]/45" />

        <div className="flex items-center justify-between pb-4 border-b border-[#c99c52]/25">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-[#d4aa62] shrink-0" />
            <div>
              <p className="font-body italic text-xs text-[#c7ad7c]">House’s Memory Archive</p>
              <h3
                id="archive-modal-title"
                className="font-display text-2xl sm:text-3xl font-semibold text-[#f5ebd8] leading-tight"
              >
                Previous Expeditions
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close archive"
            className="tactile-btn p-1.5 text-[#b5a48b] hover:text-[#f5ebd8] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {entries.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="font-display text-xl text-[#dfd2bc]">The Archive Shelf Is Bare</p>
              <p className="text-xs font-body italic text-[#a89a84] max-w-md mx-auto leading-relaxed">
                Complete an expedition—whether triumphant or claimed by the estate—and the house
                will preserve your route, seed, and remembered choices here.
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="p-4 bg-[#16110d] border border-[#c99c52]/26 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 hover:border-[#c99c52]/50 transition-colors"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <MiniRouteSvg points={entry.routePoints} />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-body">
                      <span
                        className={
                          entry.victory
                            ? 'text-[#89cbb9] font-medium'
                            : 'text-[#e5897d] font-medium'
                        }
                      >
                        {entry.victory ? 'Survived' : 'Claimed'}
                      </span>
                      <span className="text-[#8e806b]">·</span>
                      <span className="italic text-[#d6b16d]">{entry.scenarioTitle}</span>
                      <span className="text-[#8e806b]">·</span>
                      <span className="font-mono-num text-[11px] text-[#a89a84]">{entry.seed}</span>
                    </div>
                    <p className="font-display text-lg font-semibold text-[#f5ebd8] leading-snug">
                      {entry.characterName}
                    </p>
                    <p className="font-mono-num text-[11px] text-[#aba08e]">
                      {entry.turnsTaken} turns · {entry.roomsDiscovered} rooms ·{' '}
                      {entry.secretsFound} secrets
                    </p>
                    {entry.memoryFlags.length > 0 && (
                      <div className="text-xs font-body italic text-[#bfb199] leading-relaxed">
                        <span>
                          Remembered:{' '}
                          {(expandedIds[entry.id]
                            ? entry.memoryFlags
                            : entry.memoryFlags.slice(0, 3)
                          )
                            .map((f) => f.replace(/_/g, ' '))
                            .join(' · ')}
                        </span>
                        {entry.memoryFlags.length > 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedIds((prev) => ({
                                ...prev,
                                [entry.id]: !prev[entry.id],
                              }))
                            }
                            className="ml-2 not-italic text-[#d6b16d] hover:text-[#f3cb7b] underline cursor-pointer"
                          >
                            {expandedIds[entry.id]
                              ? 'Show less'
                              : `+${entry.memoryFlags.length - 3} more`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onReplaySeed(entry.seed)}
                  className="tactile-btn flex items-center gap-1.5 px-3.5 py-2 border border-[#c99c52]/48 bg-[#221a13] text-sm font-display font-semibold text-[#f0c778] hover:border-[#e6be72] hover:bg-[#2c2117] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Replay Seed
                </button>
              </div>
            ))
          )}
        </div>

        {entries.length > 0 && (
          <div className="pt-3 border-t border-[#c99c52]/20 flex flex-wrap items-center justify-between gap-2 text-xs font-body text-[#a89a84]">
            <span>Route map key:</span>
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#e2a84b]" /> Upper
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#f2e8d5]" /> Ground
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#7fb5a6]" /> Cellar
              </span>
            </span>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
