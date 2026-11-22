import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  FolderInput,
  Keyboard,
  Save,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { exportSaveJson, importSaveJson } from '../engine/saveManager';
import type { GameSettings, GameState } from '../engine/types';
import { ModalShell } from './ModalShell';

export type SettingsTab = 'audio' | 'controls' | 'saves';

interface SettingsModalProps {
  settings: GameSettings;
  activeGameState: GameState | null;
  hasActiveSave?: boolean;
  initialTab?: SettingsTab;
  onChange: (next: GameSettings) => void;
  onImportSave?: (state: GameState) => void;
  onClose: () => void;
}

const KEYBOARD_SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Tab', action: 'Toggle Tabletop Dollhouse / Immersive Room View' },
  { keys: 'Space', action: 'Re-center camera on active explorer' },
  { keys: 'E', action: 'End your turn' },
  { keys: '0 / 1 / 2 / 3', action: 'Filter floors: All / Upper / Ground / Cellar' },
  { keys: 'M', action: 'Open or close 2D Architectural Floor Plan' },
  { keys: 'J', action: 'Open or close Archivist’s Journal & Relics' },
  { keys: 'H', action: 'Toggle clean unobstructed tabletop view' },
  { keys: '?', action: 'Open Controls & Shortcuts reference' },
  { keys: 'W A S D / Arrows', action: 'Move camera in Immersive Room View' },
  { keys: 'Shift + D', action: 'Toggle Developer Diagnostics Inspector' },
  { keys: 'Esc', action: 'Close active overlay, drawer, or prompt' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  activeGameState,
  hasActiveSave = false,
  initialTab = 'audio',
  onChange,
  onImportSave,
  onClose,
}) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<GameState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const update = (patch: Partial<GameSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const handleExport = () => {
    if (!activeGameState) return;
    const json = exportSaveJson(activeGameState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blackwood-${activeGameState.seed.toLowerCase()}-t${activeGameState.turn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPendingImport(null);
    setImportError(null);
    // Reject oversized files before reading or parsing attacker-controlled JSON.
    if (file.size > 1_048_576) {
      setImportError('Save file is too large (maximum 1 MiB).');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setImportError('The selected save file could not be read.');
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const res = importSaveJson(text);
      if (res.ok) {
        setImportError(null);
        if (activeGameState || hasActiveSave) {
          setPendingImport(res.state);
        } else {
          onImportSave?.(res.state);
          onClose();
        }
      } else {
        setPendingImport(null);
        setImportError(res.error);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <ModalShell
      ariaLabelledBy="settings-modal-title"
      onClose={onClose}
      backdropClassName="bg-[#080605]/74"
    >
      <div className="walnut-panel animate-card-deal relative max-w-lg w-full p-6 max-h-[88vh] flex flex-col">
        {/* Engraved brass corner hairlines */}
        <span className="pointer-events-none absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t border-l border-[#c99c52]/45" />
        <span className="pointer-events-none absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t border-r border-[#c99c52]/45" />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b border-l border-[#c99c52]/45" />
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b border-r border-[#c99c52]/45" />

        <div className="flex items-center justify-between border-b border-[#c99c52]/25 pb-3.5">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-[#d4aa62] shrink-0" />
            <div>
              <p className="font-body italic text-xs text-[#c7ad7c]">
                Comfort, Controls & Ledger Saves
              </p>
              <h3
                id="settings-modal-title"
                className="font-display text-2xl font-semibold text-[#f5ebd8] leading-tight"
              >
                Manor Settings
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="tactile-btn p-1.5 text-[#b5a48b] hover:text-[#f5ebd8] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div
          role="tablist"
          aria-label="Settings categories"
          className="grid grid-cols-3 border-b border-[#c99c52]/20 bg-[#120e0b] mt-3"
        >
          {(
            [
              { id: 'audio', label: 'Audio & Comfort', icon: Volume2 },
              { id: 'controls', label: 'Controls', icon: Keyboard },
              { id: 'saves', label: 'Saves', icon: Save },
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
                <span>{t.label}</span>
                {active && <span className="absolute bottom-0 inset-x-3 h-[2px] bg-[#d4aa62]" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto pt-4 space-y-5 pr-0.5">
          {tab === 'audio' && (
            <>
              {/* Audio */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <p className="font-body italic text-xs text-[#d1ab67]">Soundscape & Acoustics</p>
                  <button
                    type="button"
                    onClick={() => update({ muted: !settings.muted })}
                    className="tactile-btn flex items-center gap-1.5 px-2.5 py-1 border border-[#c99c52]/40 bg-[#18130f] text-xs font-body text-[#f2e8d5] hover:border-[#d4aa62] whitespace-nowrap cursor-pointer"
                  >
                    {settings.muted ? (
                      <VolumeX className="w-3.5 h-3.5 text-[#e5897d]" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-[#d4aa62]" />
                    )}
                    {settings.muted ? 'Muted' : 'Sound On'}
                  </button>
                </div>

                {(
                  [
                    { key: 'masterVolume', label: 'Master Volume' },
                    { key: 'ambientVolume', label: 'Room Ambience' },
                    { key: 'musicVolume', label: 'Musical Cues & Bells' },
                  ] as const
                ).map((slider) => (
                  <label key={slider.key} className="block space-y-1.5">
                    <div className="flex justify-between text-xs font-body text-[#dfd2bc]">
                      <span>{slider.label}</span>
                      <span className="font-mono-num text-[#d6b16d]">
                        {Math.round(settings[slider.key] * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings[slider.key]}
                      onChange={(e) => update({ [slider.key]: Number(e.target.value) })}
                      className="w-full brass-slider"
                    />
                  </label>
                ))}
              </div>

              <div className="brass-divider" />

              {/* Accessibility & Comfort */}
              <div className="space-y-3">
                <p className="font-body italic text-xs text-[#d1ab67]">Accessibility & Comfort</p>

                {(
                  [
                    {
                      key: 'captionsEnabled',
                      label: 'Live Audio Captions',
                      desc: 'Display descriptions for room acoustics, whispers, and bells.',
                    },
                    {
                      key: 'reducedMotion',
                      label: 'Reduced Motion',
                      desc: 'Snaps camera transitions and pauses idle ambient sway & camera shake.',
                    },
                    {
                      key: 'reducedHorror',
                      label: 'Reduced-Intensity Horror',
                      desc: 'Softens eerie audio intensity and tonal shifts.',
                    },
                    {
                      key: 'showDeveloperPanel',
                      label: 'Developer Inspector (Shift+D)',
                      desc: 'Expose seed, graph verification, memory flags, and state diagnostics.',
                    },
                  ] as const
                ).map((toggle) => (
                  <label
                    key={toggle.key}
                    className="flex items-start justify-between gap-3 p-3 bg-[#15100c] border border-[#c99c52]/20 hover:border-[#c99c52]/40 transition-colors cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-body text-[#f5ebd8]">{toggle.label}</p>
                      <p className="text-xs font-body text-[#a89a84] mt-0.5 leading-relaxed">
                        {toggle.desc}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings[toggle.key]}
                      onChange={(e) => update({ [toggle.key]: e.target.checked })}
                      className="mt-1 accent-[#c99c52] w-4 h-4 shrink-0 cursor-pointer"
                    />
                  </label>
                ))}

                <div className="flex items-center justify-between gap-3 p-3 bg-[#15100c] border border-[#c99c52]/20">
                  <div>
                    <p className="text-sm font-body text-[#f5ebd8]">Text Scale</p>
                    <p className="text-xs font-body text-[#a89a84] mt-0.5">
                      Scales all interface typography for comfortable reading.
                    </p>
                  </div>
                  <div className="flex border border-[#c99c52]/35 shrink-0">
                    {(['normal', 'large'] as const).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => update({ textScale: sc })}
                        className={`tactile-btn px-3 py-1 text-xs font-body capitalize cursor-pointer ${
                          settings.textScale === sc
                            ? 'bg-[#c99c52] text-[#17110b] font-semibold'
                            : 'text-[#dfd2bc] hover:text-[#f5ebd8]'
                        }`}
                      >
                        {sc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'controls' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="font-body italic text-xs text-[#d1ab67]">
                  Tabletop Pointer & Camera
                </p>
                <div className="p-3.5 bg-[#15100c] border border-[#c99c52]/22 space-y-1.5 text-xs font-body text-[#dfd2bc] leading-relaxed">
                  <p>
                    <strong className="text-[#f5ebd8]">Click rooms, doors, curios & spirits</strong>{' '}
                    directly on the 3D dollhouse to auto-walk and act.
                  </p>
                  <p>
                    <strong className="text-[#f5ebd8]">Hover over walls</strong> to softly cut away
                    obstructions and inspect interiors.
                  </p>
                  <p>
                    <strong className="text-[#f5ebd8]">Right-drag (or drag empty space)</strong> to
                    orbit the mansion; <strong className="text-[#f5ebd8]">Scroll / Pinch</strong>{' '}
                    to zoom.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-body italic text-xs text-[#d1ab67]">Keyboard Shortcuts</p>
                <div className="divide-y divide-[#c99c52]/18 border border-[#c99c52]/24 bg-[#15100c]">
                  {KEYBOARD_SHORTCUTS.map((row) => (
                    <div
                      key={row.keys}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs"
                    >
                      <span className="font-body text-[#dfd2bc]">{row.action}</span>
                      <kbd className="font-mono-num text-[11px] px-2 py-0.5 bg-[#221a13] border border-[#c99c52]/38 text-[#f0c778] shrink-0">
                        {row.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'saves' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#15100c] border border-[#c99c52]/24 space-y-2">
                <p className="font-display text-lg font-semibold text-[#f5ebd8]">
                  Export Expedition Ledger
                </p>
                <p className="text-xs font-body text-[#c7b9a2] leading-relaxed">
                  Solo expeditions auto-save on every action. Export a portable{' '}
                  <span className="font-mono-num">.json</span> ledger to archive or resume on
                  another device.
                </p>
                {activeGameState && !activeGameState.isMultiplayer ? (
                  <button
                    type="button"
                    onClick={handleExport}
                    className="tactile-btn mt-2 w-full flex items-center justify-center gap-2 py-2.5 border border-[#c99c52]/48 bg-[#221a13] font-display text-base font-semibold text-[#f0c778] hover:border-[#e6be72] hover:bg-[#2c2117] cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Export Active Save ({activeGameState.seed} · T{activeGameState.turn})
                  </button>
                ) : (
                  <p className="text-xs font-body italic text-[#a89a84] pt-1">
                    {activeGameState?.isMultiplayer
                      ? 'Multiplayer expeditions sync live on the room server or cloud lobby.'
                      : 'Start or continue a solo expedition to export a ledger file.'}
                  </p>
                )}
              </div>

              {onImportSave && (
                <div className="p-4 bg-[#15100c] border border-[#c99c52]/24 space-y-2.5">
                  <p className="font-display text-lg font-semibold text-[#f5ebd8]">
                    Import Expedition Save
                  </p>
                  <p className="text-xs font-body text-[#c7b9a2] leading-relaxed">
                    Load a previously exported Blackwood Estate <span className="font-mono-num">.json</span>{' '}
                    save file.
                  </p>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="tactile-btn w-full flex items-center justify-center gap-2 py-2.5 border border-[#c99c52]/40 bg-[#1c1510] font-body text-sm text-[#f2e8d5] hover:border-[#d4aa62] cursor-pointer"
                  >
                    <FolderInput className="w-4 h-4 text-[#d4aa62]" />
                    Choose Save File (.json)
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {pendingImport && (
                    <div className="p-3 bg-[#261513] border border-[#a8453d]/70 space-y-2">
                      <p className="text-xs font-body text-[#f4d2cc] leading-relaxed">
                        Loading{' '}
                        <strong className="font-mono-num text-[#f5ebd8]">
                          {pendingImport.seed} · Turn {pendingImport.turn}
                        </strong>{' '}
                        will replace your current saved solo expedition.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onImportSave(pendingImport);
                            setPendingImport(null);
                            onClose();
                          }}
                          className="tactile-btn flex-1 py-1.5 bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] text-xs font-display font-semibold cursor-pointer"
                        >
                          Replace & Load
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingImport(null)}
                          className="tactile-btn px-3 py-1.5 border border-[#c99c52]/35 text-xs font-body text-[#dfd2bc] hover:text-[#f5ebd8] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {importError && (
                    <p className="text-xs font-body text-[#f2aca4] bg-[#361614] border border-[#a8453d] px-3 py-2">
                      {importError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
