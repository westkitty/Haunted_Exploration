import React from 'react';
import { getEventById } from '../engine/events';
import { getItemById } from '../engine/itemsAndOmens';
import type { ActiveEventState, PlayerState } from '../engine/types';
import { EventMotifSvg } from './CharacterPortrait';
import { ModalShell } from './ModalShell';

interface EventModalProps {
  activeEvent: ActiveEventState;
  actor: PlayerState;
  canAct: boolean;
  onSelectChoice: (choiceId: string) => void;
  onDismiss: () => void;
}

const PIP_COORDS: Record<number, [number, number][]> = {
  1: [[16, 16]],
  2: [
    [9, 9],
    [23, 23],
  ],
  3: [
    [9, 9],
    [16, 16],
    [23, 23],
  ],
  4: [
    [9, 9],
    [23, 9],
    [9, 23],
    [23, 23],
  ],
  5: [
    [9, 9],
    [23, 9],
    [16, 16],
    [9, 23],
    [23, 23],
  ],
  6: [
    [9, 8],
    [23, 8],
    [9, 16],
    [23, 16],
    [9, 24],
    [23, 24],
  ],
};

function PipDie({ value, delayMs = 0 }: { value: number; delayMs?: number }) {
  const face = Math.max(1, Math.min(6, Math.round(value)));
  const pips = PIP_COORDS[face] ?? PIP_COORDS[1];
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 32 32"
      aria-label={`Die rolled ${face}`}
      style={{ animationDelay: `${delayMs}ms` }}
      className="animate-dice-tumble shrink-0 drop-shadow-[0_3px_4px_rgba(32,20,8,0.35)]"
    >
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="5"
        fill="#faf3e3"
        stroke="#7b5c2f"
        strokeWidth="1.4"
      />
      <rect
        x="3.5"
        y="3.5"
        width="25"
        height="25"
        rx="3.5"
        fill="none"
        stroke="#e5d5b4"
        strokeWidth="0.9"
      />
      {pips.map(([cx, cy], idx) => (
        <circle
          key={idx}
          cx={cx}
          cy={cy}
          r="2.45"
          fill={face === 1 ? '#8c2a22' : '#261a10'}
        />
      ))}
    </svg>
  );
}

function titleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export const EventModal: React.FC<EventModalProps> = ({
  activeEvent,
  actor,
  canAct,
  onSelectChoice,
  onDismiss,
}) => {
  const def = getEventById(activeEvent.eventId);
  if (!def) return null;

  const reaction = def.characterReactions?.[actor.characterId];
  const roll = activeEvent.roll;

  return (
    <ModalShell
      ariaLabelledBy="event-modal-title"
      dismissible={activeEvent.resolved && canAct}
      onClose={activeEvent.resolved && canAct ? onDismiss : undefined}
      backdropClassName="bg-[#080605]/45"
    >
      <div className="parchment-card animate-card-deal max-w-xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        {/* Engraved hairline inner corner brackets */}
        <span className="pointer-events-none absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t border-l border-[#8c6a39]/60" />
        <span className="pointer-events-none absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t border-r border-[#8c6a39]/60" />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b border-l border-[#8c6a39]/60" />
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b border-r border-[#8c6a39]/60" />

        <div className="flex items-start gap-4">
          <EventMotifSvg motif={def.illustrationMotif} />
          <div className="min-w-0 flex-1">
            <p className="font-body italic text-xs text-[#73542a]">
              {titleCase(def.category)} Encounter · {actor.displayName}
            </p>
            <h3
              id="event-modal-title"
              className="font-display text-3xl text-[#1c130c] font-semibold leading-tight mt-0.5"
            >
              {def.title}
            </h3>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-[#8c6b3a]/50 to-transparent my-4" />

        <p className="font-body text-[15px] leading-relaxed text-[#251a11]">
          {def.narrative}
        </p>

        {reaction && (
          <p className="mt-4 pl-3.5 border-l border-[#8c6a39]/70 font-body text-sm italic text-[#4c3723]">
            {reaction}
          </p>
        )}

        {/* Physical Ivory Pip-Dice Roll Readout */}
        {roll && (
          <div className="mt-5 p-4 bg-[#e4d5b9]/85 border border-[#8c6a39]/45 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-body text-[#543c22]">
              <span>
                <strong className="font-semibold text-[#2d1e10]">
                  {titleCase(roll.trait)} Check
                </strong>{' '}
                · Target <span className="font-mono-num">{roll.target}</span>
              </span>
              <span
                className={
                  roll.success
                    ? 'font-semibold text-[#1f5945]'
                    : 'font-semibold text-[#8c2720]'
                }
              >
                {roll.success ? 'Succeeded' : 'Failed'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 font-mono-num text-sm text-[#1c140d]">
              <span className="inline-flex items-center gap-2">
                <PipDie value={roll.dice[0]} delayMs={0} />
                <PipDie value={roll.dice[1]} delayMs={75} />
              </span>
              <span className="text-xs text-[#4a351e]">
                + {roll.traitValue} {titleCase(roll.trait)}
              </span>
              {roll.itemModifier + roll.bonusModifier !== 0 && (
                <span className="text-xs text-[#4a351e]">
                  {roll.itemModifier + roll.bonusModifier > 0 ? '+' : '−'}{' '}
                  {Math.abs(roll.itemModifier + roll.bonusModifier)} modifier
                </span>
              )}
              {roll.fearPenalty < 0 && (
                <span className="text-xs text-[#8a2d24]">
                  − {Math.abs(roll.fearPenalty)} dread
                </span>
              )}
              <span className="font-semibold text-base text-[#1c130c] ml-auto">
                = {roll.total}
              </span>
            </div>

            <p className="font-body text-xs italic text-[#4d3823]">{roll.reason}</p>
          </div>
        )}

        {/* Outcome OR Choices */}
        {activeEvent.resolved ? (
          <div className="mt-5 space-y-4">
            <div className="p-4 bg-[#e6d8be] border border-[#8a6a3b]/40 font-body text-sm leading-relaxed text-[#1f160e]">
              {activeEvent.outcomeText}
            </div>
            {canAct ? (
              <button
                type="button"
                onClick={onDismiss}
                className="tactile-btn w-full py-3 bg-[#241a12] text-[#f5ebd8] font-display text-lg font-semibold tracking-wide hover:bg-[#35261a] cursor-pointer shadow-md"
              >
                Continue Expedition
              </button>
            ) : (
              <p className="text-center font-body italic text-xs text-[#695036]">
                Waiting for {actor.displayName} to continue…
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-2.5">
            {def.choices.map((choice) => {
              const hasRequiredItem =
                !choice.requiredItemId || actor.inventory.includes(choice.requiredItemId);
              const traitVal = choice.trait ? actor.stats[choice.trait] : null;
              return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={!canAct || !hasRequiredItem}
                  onClick={() => onSelectChoice(choice.id)}
                  className="tactile-btn w-full text-left p-3.5 bg-[#f7efe0] border border-[#8c6b3a]/50 hover:border-[#3b2816] hover:bg-[#fcf6ea] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shadow-[0_2px_6px_rgba(32,20,8,0.08)]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-lg font-semibold text-[#1c130c] leading-snug">
                      {choice.label}
                    </span>
                    {choice.trait && choice.difficulty ? (
                      <span className="font-mono-num text-[11px] text-[#6d4e26]">
                        {titleCase(choice.trait)} {traitVal} · Target {choice.difficulty}
                      </span>
                    ) : (
                      <span className="font-body italic text-xs text-[#6a5339]">
                        Direct choice
                      </span>
                    )}
                  </div>
                  <p className="font-body text-xs text-[#4b3824] mt-1 leading-relaxed">
                    {choice.detail}
                  </p>
                  {!hasRequiredItem && (
                    <p className="font-body italic text-xs text-[#8c2720] mt-1">
                      Requires{' '}
                      <strong className="font-semibold not-italic">
                        {(choice.requiredItemId && getItemById(choice.requiredItemId)?.name) ||
                          'a specific relic'}
                      </strong>{' '}
                      (not currently carried).
                    </p>
                  )}
                </button>
              );
            })}
            {!canAct && (
              <p className="text-center font-body italic text-xs text-[#695036] pt-1">
                {actor.displayName} is deciding how to respond…
              </p>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
