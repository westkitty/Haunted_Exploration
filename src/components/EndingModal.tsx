import React, { useState } from 'react';
import { Eye, EyeOff, RotateCcw, Home } from 'lucide-react';
import type { EndingSummary } from '../engine/types';
import { ModalShell } from './ModalShell';

interface EndingModalProps {
  ending: EndingSummary;
  seed: string;
  onNewExpedition: () => void;
  onReturnMenu: () => void;
}

export const EndingModal: React.FC<EndingModalProps> = ({
  ending,
  seed,
  onNewExpedition,
  onReturnMenu,
}) => {
  const [inspectingDollhouse, setInspectingDollhouse] = useState(false);

  if (inspectingDollhouse) {
    return (
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 walnut-panel animate-card-deal px-5 py-3 flex items-center gap-4">
        <span className="font-body italic text-sm text-[#e8d9be] whitespace-nowrap">
          Final House Reveal — drag to trace your golden route
        </span>
        <button
          type="button"
          onClick={() => setInspectingDollhouse(false)}
          className="tactile-btn flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-b from-[#dfb467] to-[#b8893f] text-[#17110b] text-sm font-display font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          Show Epilogue
        </button>
      </div>
    );
  }

  return (
    <ModalShell
      ariaLabelledBy="ending-modal-title"
      dismissible={false}
      backdropClassName="bg-[#080605]/68"
    >
      <div className="parchment-card animate-card-deal relative max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        {/* Engraved brass corner hairlines */}
        <span className="pointer-events-none absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t border-l border-[#8c6b3a]/65" />
        <span className="pointer-events-none absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t border-r border-[#8c6b3a]/65" />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b border-l border-[#8c6b3a]/65" />
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b border-r border-[#8c6b3a]/65" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body italic text-xs text-[#735329]">
            Final House Reveal ·{' '}
            <span className="not-italic font-mono-num text-xs text-[#5e4422]">{seed}</span>
          </p>
          <button
            type="button"
            onClick={() => setInspectingDollhouse(true)}
            className="tactile-btn flex items-center gap-1.5 px-3 py-1.5 border border-[#8c6b3a]/60 bg-[#f6eedf]/60 text-xs font-body text-[#3b2816] hover:bg-[#e5d6ba] hover:border-[#3b2816] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5" />
            Inspect 3D Path
          </button>
        </div>

        <h2
          id="ending-modal-title"
          className="font-display text-3xl sm:text-4xl font-semibold text-[#1c140d] leading-tight mt-2"
        >
          {ending.title}
        </h2>
        <p className="font-body italic text-base text-[#664b2c] mt-1">
          {ending.victory
            ? 'The expedition endures past the thirteenth hour.'
            : `Claimed by the ${ending.winningSide === 'chosen' ? 'Chosen of Blackwood' : 'Estate'}.`}
        </p>

        <div className="h-px bg-gradient-to-r from-[#8c6b3a]/55 via-[#8c6b3a]/25 to-transparent my-4" />

        <p className="font-body text-[15px] leading-relaxed text-[#241a12]">
          {ending.epilogue}
        </p>

        {ending.betrayerName && (
          <div className="mt-4 p-3.5 bg-[#ead5cf] border border-[#8c2d25]/55 text-xs font-body text-[#4f1915] leading-relaxed">
            <strong className="font-semibold">Truth Unmasked:</strong> {ending.betrayerName}{' '}
            carried the House’s secret mandate during the Revelation.
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-[#e7d9bf] border border-[#8c6b3a]/40">
            <p className="font-mono-num text-2xl font-semibold text-[#1c140d]">
              {ending.turnsTaken}
            </p>
            <p className="font-body italic text-xs text-[#664b2c] mt-0.5">Turns Endured</p>
          </div>
          <div className="p-3 bg-[#e7d9bf] border border-[#8c6b3a]/40">
            <p className="font-mono-num text-2xl font-semibold text-[#1c140d]">
              {ending.roomsDiscovered}
            </p>
            <p className="font-body italic text-xs text-[#664b2c] mt-0.5">Rooms Mapped</p>
          </div>
          <div className="p-3 bg-[#e7d9bf] border border-[#8c6b3a]/40">
            <p className="font-mono-num text-2xl font-semibold text-[#1c140d]">
              {ending.secretsFound}
            </p>
            <p className="font-body italic text-xs text-[#664b2c] mt-0.5">Secrets & Omens</p>
          </div>
        </div>

        {ending.keyMoments.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="font-body italic text-xs text-[#664b2c]">
              Recorded in the House’s Memory Archive
            </p>
            <ul className="space-y-1.5 text-xs font-body text-[#3a2a1b] leading-relaxed">
              {ending.keyMoments.map((m, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#8c6b3a] mt-0.5">—</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onNewExpedition}
            className="tactile-btn flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-[#241a12] text-[#f4ead8] font-display text-base font-semibold tracking-wide hover:bg-[#352619] whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Begin New Expedition
          </button>
          <button
            type="button"
            onClick={onReturnMenu}
            className="tactile-btn flex items-center justify-center gap-2 py-3 px-5 border border-[#8c6b3a]/60 bg-[#f6eedf]/65 text-[#241a12] font-display text-base font-semibold tracking-wide hover:bg-[#e5d6ba] hover:border-[#241a12] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Main Menu
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
