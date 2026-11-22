import React from 'react';
import { BookOpen, KeyRound, X } from 'lucide-react';
import { getClueById, getPuzzleById } from '../engine/itemsAndOmens';
import type { ActivePuzzleState } from '../engine/types';
import { ModalShell } from './ModalShell';

interface PuzzleModalProps {
  activePuzzle: ActivePuzzleState;
  cluesFound: string[];
  canAct: boolean;
  onAttemptOption: (optionId: string) => void;
  onClose: () => void;
}

export const PuzzleModal: React.FC<PuzzleModalProps> = ({
  activePuzzle,
  cluesFound,
  canAct,
  onAttemptOption,
  onClose,
}) => {
  const def = getPuzzleById(activePuzzle.puzzleId);
  if (!def) return null;

  const relevantClues = def.clueIds
    .filter((id) => cluesFound.includes(id))
    .map((id) => getClueById(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <ModalShell
      ariaLabelledBy="puzzle-modal-title"
      dismissible={canAct}
      onClose={canAct ? onClose : undefined}
      backdropClassName="bg-[#080605]/45"
    >
      <div className="parchment-card animate-card-deal max-w-xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        {/* Engraved hairline inner corner brackets */}
        <span className="pointer-events-none absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t border-l border-[#8c6a39]/60" />
        <span className="pointer-events-none absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t border-r border-[#8c6a39]/60" />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b border-l border-[#8c6a39]/60" />
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b border-r border-[#8c6a39]/60" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 bg-[#e2d3b6] border border-[#8c6a39]/65 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-[#3b2816]" />
            </div>
            <div>
              <p className="font-body italic text-xs text-[#73542a]">
                Architectural Mechanism ·{' '}
                <span className="not-italic font-mono-num">
                  {activePuzzle.attempts}{' '}
                  {activePuzzle.attempts === 1 ? 'attempt' : 'attempts'}
                </span>
              </p>
              <h3
                id="puzzle-modal-title"
                className="font-display text-2xl sm:text-3xl text-[#1c130c] font-semibold leading-tight"
              >
                {def.title}
              </h3>
            </div>
          </div>
          {canAct && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Step back from mechanism"
              className="tactile-btn p-1.5 text-[#5c4327] hover:text-[#1c130c] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-[#8c6b3a]/50 to-transparent my-4" />

        <p className="font-body text-[15px] leading-relaxed text-[#251a11]">
          {def.prompt}
        </p>

        {/* Clue Reference Slip */}
        <div className="mt-4 p-4 bg-[#e4d5b9]/85 border border-[#8c6a39]/40 space-y-2">
          <p className="font-body text-xs font-semibold text-[#5a3f20] flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[#7a582b]" />
            Relevant Journal Clues{' '}
            <span className="font-mono-num font-normal text-[#6f522b]">
              ({relevantClues.length} of {def.clueIds.length})
            </span>
          </p>
          {relevantClues.length > 0 ? (
            <ul className="space-y-1.5 font-body text-xs text-[#2b1e12]">
              {relevantClues.map((clue) => (
                <li key={clue.id} className="leading-relaxed">
                  <strong>{clue.title}:</strong> “{clue.excerpt}”{' '}
                  <span className="italic text-[#624524]">({clue.mechanicalHint})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body text-xs italic text-[#5c462f]">
              Clues matching this mechanism lie elsewhere in the manor. You can step back
              without penalty to gather them, or attempt a deduction now.
            </p>
          )}
        </div>

        {activePuzzle.feedback && (
          <div className="mt-4 p-3.5 border font-body text-xs leading-relaxed bg-[#ebd4ce] border-[#96362d] text-[#5e1c17]">
            {activePuzzle.feedback}
          </div>
        )}

        <div className="mt-5 space-y-2.5">
          {def.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={!canAct}
              onClick={() => onAttemptOption(opt.id)}
              className="tactile-btn w-full text-left p-3.5 bg-[#f7efe0] border border-[#8c6b3a]/50 hover:border-[#2a1c10] hover:bg-[#fcf6ea] cursor-pointer disabled:opacity-45 shadow-[0_2px_6px_rgba(32,20,8,0.08)]"
            >
              <p className="font-display text-lg font-semibold text-[#1c130c] leading-snug">
                {opt.label}
              </p>
            </button>
          ))}
          {canAct && (
            <button
              type="button"
              onClick={onClose}
              className="tactile-btn w-full py-2 text-xs font-body italic text-[#654928] hover:text-[#1c130c] cursor-pointer"
            >
              Step back without spending AP
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
