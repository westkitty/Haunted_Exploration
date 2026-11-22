import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  FolderInput,
  Play,
  RotateCcw,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { importSaveJson } from '../engine/saveManager';
import type { GameState } from '../engine/types';

export interface MpResumeInfo {
  mode: 'firebase' | 'ws';
  code: string;
  playerId: string;
  displayName: string;
}

interface MainMenuProps {
  hasSave: boolean;
  savedSeed?: string;
  savedTurn?: number;
  mpResume?: MpResumeInfo | null;
  archiveCount: number;
  onStartSolo: () => void;
  onContinue: () => void;
  onOpenMultiplayer: () => void;
  onResumeMultiplayer?: () => void;
  onDismissMpResume?: () => void;
  onOpenArchive: () => void;
  onOpenSettings: () => void;
  onImportSave: (state: GameState) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  hasSave,
  savedSeed,
  savedTurn,
  mpResume,
  archiveCount,
  onStartSolo,
  onContinue,
  onOpenMultiplayer,
  onResumeMultiplayer,
  onDismissMpResume,
  onOpenArchive,
  onOpenSettings,
  onImportSave,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const res = importSaveJson(text);
      if (res.ok) {
        setImportError(null);
        onImportSave(res.state);
      } else {
        setImportError(res.error);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center p-7 sm:p-14 pointer-events-none">
      {/* Soft left-edge study shadow ONLY — right 65%+ stays completely open to the lit 3D dollhouse */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(96deg, rgba(10,7,6,0.84) 0%, rgba(10,7,6,0.56) 28%, rgba(10,7,6,0.12) 56%, rgba(10,7,6,0.0) 82%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[368px] space-y-8 pointer-events-auto">
        {/* Editorial Title & Epigraph */}
        <div className="space-y-3 [text-shadow:0_2px_18px_rgba(0,0,0,0.94)]">
          <p className="font-body italic text-xs tracking-wide text-[#d9b26f]">
            Blackwood Estate, 1889
          </p>

          <h1 className="font-display text-5xl sm:text-[56px] font-semibold text-[#f8f0df] leading-[0.98] tracking-tight">
            The House That Remembers
          </h1>

          <p className="font-body italic text-[15px] text-[#ded0b7] leading-relaxed pt-1">
            “Every door remembers who opened it.”
          </p>
        </div>

        {/* Unboxed Editorial Tabletop Navigation */}
        <nav aria-label="Main Menu" className="space-y-1">
          <div className="pb-3">
            {hasSave ? (
              <button
                type="button"
                onClick={onContinue}
                className="tactile-btn group w-full flex items-center justify-between px-5 py-3.5 bg-gradient-to-b from-[#d8ad62] to-[#b3853e] text-[#16100a] hover:from-[#e6bd74] hover:to-[#c19147] cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,244,218,0.55)]"
              >
                <span className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight">
                  <Play className="w-4 h-4 fill-current" />
                  Continue Expedition
                </span>
                <span className="flex items-center gap-1.5 font-mono-num text-[11px] font-semibold opacity-85">
                  {savedSeed ? `${savedSeed} · T${savedTurn ?? 1}` : 'Saved'}
                  <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartSolo}
                className="tactile-btn group w-full flex items-center justify-between px-5 py-3.5 bg-gradient-to-b from-[#d8ad62] to-[#b3853e] text-[#16100a] hover:from-[#e6bd74] hover:to-[#c19147] cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,244,218,0.55)]"
              >
                <span className="font-display text-xl font-semibold tracking-tight">
                  Begin Expedition
                </span>
                <span className="flex items-center gap-2 text-xs font-body opacity-80">
                  Solo
                  <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </span>
              </button>
            )}
          </div>

          <div className="divide-y divide-[#e8d5b3]/15 border-y border-[#e8d5b3]/15 [text-shadow:0_2px_10px_rgba(0,0,0,0.95)]">
            {hasSave && (
              <div className="py-2.5 px-1">
                {!confirmOverwrite ? (
                  <button
                    type="button"
                    onClick={() => setConfirmOverwrite(true)}
                    className="tactile-btn group w-full flex items-center justify-between py-0.5 text-left text-[#f4ead7] hover:text-[#f5cf84] cursor-pointer"
                  >
                    <span className="flex items-center gap-3 font-display text-xl font-medium">
                      <Compass className="w-4 h-4 text-[#dfa953] transition-transform duration-150 group-hover:translate-x-0.5" />
                      Begin New Expedition
                    </span>
                    <span className="font-body italic text-xs text-[#cbbca1]">Solo</span>
                  </button>
                ) : (
                  <div className="p-2.5 bg-[#1b120e]/92 border border-[#c99c52]/40 space-y-2 [text-shadow:none]">
                    <p className="text-xs font-body text-[#efe1c8] leading-snug">
                      Starting a new solo expedition will replace your saved run (
                      <span className="font-mono-num text-[#f0c778]">
                        {savedSeed ?? 'Active'} · T{savedTurn ?? 1}
                      </span>
                      ).
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmOverwrite(false);
                          onStartSolo();
                        }}
                        className="tactile-btn flex-1 py-1.5 bg-gradient-to-b from-[#d8ad62] to-[#b3853e] text-[#16100a] text-xs font-display font-semibold cursor-pointer"
                      >
                        Replace Saved Expedition
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmOverwrite(false)}
                        className="tactile-btn px-3 py-1.5 border border-[#c99c52]/35 text-xs font-body text-[#dfd2bc] hover:text-[#f5ebd8] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mpResume && onResumeMultiplayer && (
              <div className="flex items-center justify-between gap-2 py-2.5 px-1">
                <button
                  type="button"
                  onClick={onResumeMultiplayer}
                  className="tactile-btn group flex-1 flex items-center justify-between text-left text-[#d6f2ea] hover:text-[#f5cf84] cursor-pointer"
                >
                  <span className="flex items-center gap-3 font-display text-lg font-medium">
                    <RotateCcw className="w-4 h-4 text-[#86c4b4]" />
                    Rejoin Party {mpResume.code}
                  </span>
                  <span className="font-body italic text-xs text-[#9bd8c8]">
                    {mpResume.mode === 'firebase' ? 'Cloud' : 'Quick'}
                  </span>
                </button>
                {onDismissMpResume && (
                  <button
                    type="button"
                    onClick={onDismissMpResume}
                    aria-label="Dismiss rejoin party shortcut"
                    title="Dismiss"
                    className="tactile-btn p-1 text-[#a89a84] hover:text-[#f5ebd8] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="tactile-btn group w-full flex items-center justify-between py-3 px-1 text-left text-[#f2e7d3] hover:text-[#f5cf84] cursor-pointer"
            >
              <span className="flex items-center gap-3 font-display text-xl font-medium">
                <Users className="w-4 h-4 text-[#86c4b4] transition-transform duration-150 group-hover:translate-x-0.5" />
                Play with Friends
              </span>
              <span className="font-body italic text-xs text-[#cbbca1]">2–4 online</span>
            </button>

            <button
              type="button"
              onClick={onOpenArchive}
              className="tactile-btn group w-full flex items-center justify-between py-3 px-1 text-left text-[#e8dcc6] hover:text-[#f5cf84] cursor-pointer"
            >
              <span className="flex items-center gap-3 font-display text-xl font-medium">
                <BookOpen className="w-4 h-4 text-[#cca058] transition-transform duration-150 group-hover:translate-x-0.5" />
                Memory Archive
              </span>
              <span className="font-mono-num text-xs text-[#baa98c]">{archiveCount}</span>
            </button>
          </div>

          <div className="flex items-center gap-5 pt-4 text-xs font-body text-[#d4c6ad] [text-shadow:0_1px_8px_rgba(0,0,0,0.95)]">
            <button
              type="button"
              onClick={onOpenSettings}
              className="tactile-btn flex items-center gap-1.5 hover:text-[#f7eedc] cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-[#c99c52]" />
              Settings
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="tactile-btn flex items-center gap-1.5 hover:text-[#f7eedc] cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5 text-[#c99c52]" />
              Import Save
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {importError && (
            <p className="mt-3 text-xs text-[#f2aca4] bg-[#361614]/92 border border-[#a8453d] px-3 py-2">
              {importError}
            </p>
          )}
        </nav>
      </div>
    </div>
  );
};
