import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Compass,
  Eye,
  Flame,
  Key,
  ScrollText,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { getCharacterById } from '../engine/characters';
import { getClueById, getItemById, getOmenById } from '../engine/itemsAndOmens';
import type { GameState, JournalEntry } from '../engine/types';
import { CharacterPortrait } from './CharacterPortrait';
import { ModalShell } from './ModalShell';

export type JournalTab = 'satchel' | 'clues' | 'log' | 'memory';

type LogFilter = 'all' | 'clue' | 'ghost' | 'event' | 'discovery' | 'action';

const LOG_FILTERS: { id: LogFilter; label: string; categories?: JournalEntry['category'][] }[] = [
  { id: 'all', label: 'All' },
  { id: 'clue', label: 'Clues', categories: ['clue', 'omen'] },
  { id: 'ghost', label: 'Spirits', categories: ['ghost'] },
  { id: 'event', label: 'Events', categories: ['event', 'revelation'] },
  { id: 'discovery', label: 'Discovery', categories: ['discovery'] },
  { id: 'action', label: 'Actions', categories: ['action', 'memory'] },
];

interface JournalDrawerProps {
  state: GameState;
  localPlayerId: string;
  canAct: boolean;
  initialTab?: JournalTab;
  onUseItem: (itemId: string, targetPlayerId?: string) => void;
  onTradeItem: (targetPlayerId: string, itemId: string) => void;
  onClose: () => void;
}

export const JournalDrawer: React.FC<JournalDrawerProps> = ({
  state,
  localPlayerId,
  canAct,
  initialTab = 'log',
  onUseItem,
  onTradeItem,
  onClose,
}) => {
  const [tab, setTab] = useState<JournalTab>(initialTab);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const me =
    state.players.find((p) => p.id === localPlayerId) ??
    state.players[state.currentPlayerIndex];
  const myChar = getCharacterById(me.characterId);

  const alliesInSameRoom = state.players.filter(
    (p) => p.id !== me.id && p.alive && p.roomId === me.roomId
  );

  const activeFilterDef = LOG_FILTERS.find((f) => f.id === logFilter);
  const filteredJournal =
    logFilter === 'all' || !activeFilterDef?.categories
      ? state.journal
      : state.journal.filter((entry) => activeFilterDef.categories!.includes(entry.category));

  return (
    <ModalShell
      variant="drawer"
      ariaLabelledBy="journal-drawer-title"
      onClose={onClose}
      backdropClassName="bg-[#080605]/58"
    >
      <div className="walnut-panel animate-drawer-in w-full max-w-lg h-full flex flex-col border-l border-[#c99c52]/40">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#c99c52]/25">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-[#d4aa62] shrink-0" />
            <div>
              <p className="font-body italic text-xs text-[#c7ad7c]">
                Expedition Ledger ·{' '}
                <span className="not-italic font-mono-num text-[11px] text-[#b49c74]">
                  {state.seed}
                </span>
              </p>
              <h3
                id="journal-drawer-title"
                className="font-display text-2xl font-semibold text-[#f5ebd8] leading-tight"
              >
                Archivist’s Journal
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close journal"
            className="tactile-btn p-1.5 text-[#b5a48b] hover:text-[#f5ebd8] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Journal sections"
          className="grid grid-cols-4 border-b border-[#c99c52]/20 bg-[#120e0b]"
        >
          {(
            [
              { id: 'satchel', label: 'Explorer', count: me.inventory.length, icon: Flame },
              { id: 'clues', label: 'Clues', count: state.cluesFound.length, icon: Key },
              { id: 'log', label: 'Log', count: null, icon: ScrollText },
              { id: 'memory', label: 'House', count: state.memoryFlags.length, icon: Eye },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`tactile-btn relative py-2.5 px-2 text-xs font-body flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#211912] text-[#f0c778] font-medium'
                    : 'text-[#aba08e] hover:text-[#f2e8d5]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {t.label}
                  {t.count !== null && (
                    <span className="font-mono-num text-[11px] ml-1 opacity-80">({t.count})</span>
                  )}
                </span>
                {active && (
                  <span className="absolute bottom-0 inset-x-3 h-[2px] bg-[#d4aa62]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tab === 'log' && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-2 border-b border-[#c99c52]/18">
                {LOG_FILTERS.map((f) => {
                  const active = logFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setLogFilter(f.id)}
                      className={`tactile-btn relative pb-1 text-xs font-body cursor-pointer ${
                        active
                          ? 'text-[#f0c778] font-medium'
                          : 'text-[#aba08e] hover:text-[#f2e8d5]'
                      }`}
                    >
                      {f.label}
                      {active && (
                        <span className="absolute bottom-0 inset-x-0 h-[1.5px] bg-[#d4aa62]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {filteredJournal.length === 0 ? (
                <p className="text-xs font-body italic text-[#a89a84] py-4">
                  No ledger entries recorded under this filter yet.
                </p>
              ) : (
                filteredJournal.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3.5 bg-[#15100c] border border-[#c99c52]/20 space-y-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-base font-semibold text-[#e6be72]">
                        {entry.title}
                      </span>
                      <span className="font-mono-num text-[11px] text-[#a3947e] shrink-0">
                        Turn {entry.turn}
                      </span>
                    </div>
                    <p className="font-body text-xs text-[#e2d6c2] leading-relaxed">{entry.text}</p>
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'clues' && (
            <>
              {state.cluesFound.length === 0 ? (
                <p className="text-sm font-body italic text-[#a89a84] leading-relaxed">
                  No witness-clues recorded yet. Search rooms and inspect notable architectural
                  objects to uncover notes that unlock mechanisms and truth.
                </p>
              ) : (
                state.cluesFound.map((cid) => {
                  const clue = getClueById(cid);
                  if (!clue) return null;
                  return (
                    <div
                      key={cid}
                      className="p-3.5 bg-[#1b1510] border border-[#c99c52]/32 space-y-1.5"
                    >
                      <p className="font-display text-base font-semibold text-[#ebc375]">
                        {clue.title}
                      </p>
                      <p className="font-body italic text-xs text-[#e8dcc6] leading-relaxed">
                        “{clue.excerpt}”
                      </p>
                      <p className="text-xs font-body text-[#cfa762] pt-0.5">
                        {clue.mechanicalHint}
                      </p>
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'satchel' && (
            <div className="space-y-4">
              {/* Compact Explorer Sheet (Passive, Weakness, Active Conditions, Roll Bonus) */}
              <div className="p-4 bg-[#17120e] border border-[#c99c52]/32 space-y-3">
                <div className="flex items-start gap-3">
                  <CharacterPortrait character={myChar} size={50} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl font-semibold text-[#f5ebd8] leading-tight truncate">
                      {me.displayName}
                    </p>
                    <p className="font-body italic text-xs text-[#d4aa62]">{myChar.title}</p>
                    <p className="font-mono-num text-[11px] text-[#cbb692] mt-1">
                      Health {me.health}/{me.maxHealth} · Fear {me.fear}/{me.maxFear} · AP{' '}
                      {me.actionPoints}/{me.maxActionPoints}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 py-2 border-y border-[#c99c52]/20 text-center">
                  {(
                    [
                      ['Body', me.stats.body],
                      ['Grace', me.stats.grace],
                      ['Insight', me.stats.insight],
                      ['Nerve', me.stats.nerve],
                    ] as const
                  ).map(([label, val]) => (
                    <div key={label}>
                      <p className="font-body text-[11px] text-[#b4a184]">{label}</p>
                      <p className="font-mono-num text-sm font-semibold text-[#f5ebd8]">{val}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 text-xs font-body text-[#dfd2bc] leading-relaxed">
                  <p>
                    <Compass className="inline w-3.5 h-3.5 text-[#89cbb9] mr-1.5 -mt-0.5" />
                    <strong className="font-semibold text-[#9bd8c8]">{myChar.passiveName}:</strong>{' '}
                    {myChar.passiveDesc}
                  </p>
                  <p>
                    <Shield className="inline w-3.5 h-3.5 text-[#e5897d] mr-1.5 -mt-0.5" />
                    <strong className="font-semibold text-[#f0a599]">
                      {myChar.weaknessName}:
                    </strong>{' '}
                    {myChar.weaknessDesc}
                  </p>
                </div>

                {(me.nextRollBonus > 0 || me.conditions.length > 0) && (
                  <div className="pt-2 border-t border-[#c99c52]/20 space-y-1 text-xs font-body">
                    {me.nextRollBonus > 0 && (
                      <p className="text-[#96d2c2] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        Prepared: <span className="font-mono-num font-semibold">+{me.nextRollBonus}</span>{' '}
                        bonus on your next trait roll
                      </p>
                    )}
                    {me.conditions.length > 0 && (
                      <p className="text-[#e59a8e]">
                        Conditions:{' '}
                        <span className="capitalize">
                          {me.conditions.map((c) => c.replace(/_/g, ' ')).join(', ')}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Relics & Tools — ALL items with activeEffect are now usable! */}
              <div className="space-y-2.5">
                <p className="font-body italic text-xs text-[#d1ab67]">
                  Carried Relics & Tools{' '}
                  <span className="not-italic font-mono-num text-[11px] opacity-80">
                    ({me.inventory.length})
                  </span>
                </p>
                {me.inventory.length === 0 ? (
                  <p className="text-xs font-body italic text-[#a89a84]">Your satchel is empty.</p>
                ) : (
                  me.inventory.map((iid, idx) => {
                    const item = getItemById(iid);
                    if (!item) return null;
                    const hasActiveEffect = Object.keys(item.activeEffect).length > 0;
                    const canHealAlly = Boolean(item.activeEffect.healHealth);
                    const passiveBonusEntries = item.passiveTraitBonus
                      ? Object.entries(item.passiveTraitBonus)
                      : [];

                    return (
                      <div
                        key={`${iid}_${idx}`}
                        className="p-3.5 bg-[#17120e] border border-[#c99c52]/28 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-display text-base font-semibold text-[#f5ebd8] leading-snug">
                              {item.name}
                              <span className="ml-2 font-body font-normal italic text-[11px] text-[#b49c74]">
                                {item.consumable ? 'Single-use' : 'Reusable'}
                              </span>
                            </p>
                            <p className="text-xs font-body text-[#d6b16d] mt-0.5">
                              {item.effectText}
                            </p>
                            {passiveBonusEntries.length > 0 && (
                              <p className="text-[11px] font-body text-[#96d2c2] mt-0.5">
                                Passive:{' '}
                                {passiveBonusEntries
                                  .map(
                                    ([trait, val]) =>
                                      `+${val} ${trait.charAt(0).toUpperCase()}${trait.slice(1)}`
                                  )
                                  .join(', ')}
                              </p>
                            )}
                          </div>
                          {hasActiveEffect && canAct && me.actionPoints >= 1 && (
                            <button
                              type="button"
                              onClick={() => onUseItem(iid)}
                              className="tactile-btn px-2.5 py-1 bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] text-xs font-display font-semibold whitespace-nowrap shrink-0 cursor-pointer hover:from-[#ecc379] hover:to-[#c79547]"
                            >
                              {item.consumable ? 'Consume · 1 AP' : 'Use · 1 AP'}
                            </button>
                          )}
                        </div>

                        {item.tradeoffText && (
                          <p className="text-xs font-body text-[#e59a8e]">
                            Tradeoff: {item.tradeoffText}
                          </p>
                        )}

                        <p className="text-xs font-body italic text-[#a89a84] leading-relaxed">
                          {item.description}
                        </p>

                        {alliesInSameRoom.length > 0 && canAct && me.actionPoints >= 1 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {canHealAlly &&
                              alliesInSameRoom
                                .filter((a) => a.health < a.maxHealth)
                                .map((ally) => (
                                  <button
                                    key={`heal_${ally.id}`}
                                    type="button"
                                    onClick={() => onUseItem(iid, ally.id)}
                                    className="tactile-btn px-2.5 py-1 border border-[#d4aa62]/55 bg-[#231b13] text-xs font-body text-[#f0c778] hover:border-[#f0c778] whitespace-nowrap cursor-pointer"
                                  >
                                    Tend {ally.displayName}{' '}
                                    <span className="font-mono-num text-[11px] opacity-80">
                                      1 AP
                                    </span>
                                  </button>
                                ))}
                            {alliesInSameRoom.map((ally) => (
                              <button
                                key={ally.id}
                                type="button"
                                onClick={() => onTradeItem(ally.id, iid)}
                                className="tactile-btn px-2.5 py-1 border border-[#7fb5a6]/45 bg-[#13201d] text-xs font-body text-[#96d2c2] hover:border-[#96d2c2] whitespace-nowrap cursor-pointer"
                              >
                                Give to {ally.displayName}{' '}
                                <span className="font-mono-num text-[11px] opacity-80">1 AP</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="brass-divider" />

              <div className="space-y-2.5">
                <p className="font-body italic text-xs text-[#e08a7e]">
                  Omens Bound to the Expedition{' '}
                  <span className="not-italic font-mono-num text-[11px] opacity-80">
                    ({state.omensFound.length})
                  </span>
                </p>
                {state.omensFound.length === 0 ? (
                  <p className="text-xs font-body italic text-[#a89a84]">
                    No omens have awakened yet.
                  </p>
                ) : (
                  state.omensFound.map((oid) => {
                    const omen = getOmenById(oid);
                    if (!omen) return null;
                    return (
                      <div
                        key={oid}
                        className="p-3.5 bg-[#1e1312] border border-[#9e3b33]/45 space-y-1"
                      >
                        <p className="font-display text-base font-semibold text-[#f4d4ce]">
                          {omen.name}
                        </p>
                        <p className="text-xs font-body text-[#dfd2bc]">{omen.curseNote}</p>
                        <p className="text-xs font-body italic text-[#a89a84] leading-relaxed">
                          {omen.description}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'memory' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#18120e] border border-[#c99c52]/32 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-base font-semibold text-[#e6be72]">
                    House’s Attention
                  </span>
                  <span className="font-body text-xs capitalize text-[#f2e8d5]">
                    {state.attention.temperament} ·{' '}
                    <span className="font-mono-num">{state.attention.level}/100</span>
                  </span>
                </div>
                <p className="text-xs font-body text-[#ddd0b9] leading-relaxed">
                  {state.attention.recentSignal}
                </p>
              </div>

              {state.scenario && (
                <div className="p-3.5 bg-[#201412] border border-[#9e3b33]/55 space-y-2">
                  <p className="font-body italic text-xs text-[#e5897d]">
                    Altered House Rules · {state.scenario.title}
                  </p>
                  <p className="text-xs font-body text-[#f5ebd8] leading-relaxed">
                    {state.scenario.alteredRuleText}
                  </p>
                  <p className="text-xs font-body text-[#d6b16d] leading-relaxed">
                    Objective: {state.scenario.publicObjective}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="font-body italic text-xs text-[#d1ab67]">
                  What The House Remembers{' '}
                  <span className="not-italic font-mono-num text-[11px] opacity-80">
                    ({state.memoryFlags.length})
                  </span>
                </p>
                {state.memoryFlags.length === 0 ? (
                  <p className="text-xs font-body italic text-[#a89a84] leading-relaxed">
                    Your choices have not yet etched a lasting mark into the walls.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {state.memoryFlags.map((flag) => (
                      <li
                        key={flag}
                        className="px-3 py-2 bg-[#15100c] border border-[#c99c52]/24 font-body text-xs text-[#e2d6c2] capitalize"
                      >
                        {flag.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
