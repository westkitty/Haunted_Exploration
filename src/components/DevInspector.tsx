import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { verifyMansionGraph } from '../engine/mansionGenerator';
import type { GameState } from '../engine/types';

interface DevInspectorProps {
  state: GameState;
  onClose: () => void;
}

export const DevInspector: React.FC<DevInspectorProps> = ({ state, onClose }) => {
  const graphCheck = useMemo(() => verifyMansionGraph(state.rooms), [state.rooms]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="region"
      aria-label="Developer Inspector"
      className="fixed top-16 right-4 z-40 w-80 max-h-[72vh] overflow-y-auto walnut-panel p-4 text-xs font-mono space-y-2.5 border border-[#c59b56]/60"
    >
      <div className="flex items-center justify-between border-b border-[#c59b56]/30 pb-2">
        <span className="font-display text-sm font-semibold text-[#d6b16d]">QA / Dev Inspector</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close developer inspector"
          className="text-[#a3947e] hover:text-[#f2e8d5] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1 text-[#d9ccb5]">
        <div>Seed: <span className="text-[#f2e8d5]">{state.seed}</span></div>
        <div>Schema v{state.schemaVersion} · State v{state.version}</div>
        <div>Phase: <span className="text-[#e2a84b]">{state.phase}</span> · Turn {state.turn}</div>
        <div>Pressure: {state.pressure}/{state.revelationThreshold}</div>
        <div>Attention: {state.attention.temperament} ({state.attention.level})</div>
        <div>Rooms: {state.roomOrder.length} · Ghosts: {state.ghosts.length}</div>
        <div>
          Graph Integrity:{' '}
          <span className={graphCheck.valid ? 'text-[#7fb5a6]' : 'text-[#e07a6f]'}>
            {graphCheck.valid
              ? `PASS (${graphCheck.reachableCount} reachable)`
              : `FAIL (${graphCheck.errors.length})`}
          </span>
        </div>
        {!graphCheck.valid && (
          <ul className="text-[10px] text-[#e07a6f] list-disc pl-4">
            {graphCheck.errors.slice(0, 4).map((iss, idx) => (
              <li key={idx}>{iss}</li>
            ))}
          </ul>
        )}
        <div>Scenario: {state.scenario ? `${state.scenario.id} (T-${state.scenario.countdown})` : 'None'}</div>
        <div>Memory Flags: {state.memoryFlags.join(', ') || 'none'}</div>
        <div>Processed Actions: {state.processedActionIds.length}</div>
      </div>

      <div className="border-t border-[#c59b56]/25 pt-2">
        <p className="text-[#c59b56] mb-1">Active Ghosts</p>
        {state.ghosts.map((g) => (
          <div key={g.id} className="text-[11px] text-[#bfb199]">
            {g.name} ({g.state}) @ {state.rooms[g.roomId]?.name ?? g.roomId}
          </div>
        ))}
      </div>
    </div>
  );
};
