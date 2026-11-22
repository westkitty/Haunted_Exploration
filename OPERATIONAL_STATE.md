# Operational State — Haunted Exploration

Last inspected: 2026-11-22. This file tracks verified work, not an aspirational status.

## Authority and identity
- **Write target ONLY:** westkitty/Haunted_Exploration. Do not write to either source repository.
- **Target initial main:** 070f059b3a05610a68ea6dcdc98143d030005957 (README bootstrap only).
- **Working branch:** integration/agy-haunted-p001-p003 (not merged or deployed).
- **Agy foundation:** westkitty/Betrayal_Agy main at 9922de88a5990f0e21fe810138577ff0209c9248.
- **Haunted reference:** westkitty/Haunted_Betrayal arena/80bdded6-haunted-betrayal at d00799b43e0d1aa2c959fbbafc7f2a26753c7cc6.

## Protected capabilities
- One authoritative Agy GameState and action resolver, persistent MansionSceneManager, seeded graph generation with explicit floors, four scenario definitions, six Agy character IDs, player progression, House Attention, audio and captions, solo save/resume and archive, two camera perspectives.
- Haunted remains independent reference; no automatic lore reconciliation, character rename, or old-save conversion.
- Experimental multiplayer remains **UNSAFE for public deployment** until P005/P007 security gates; do not expose a publicly reachable server or enable a Firebase project by default.

## Phase state
- P001: source pins and inventory verified, target created; verification of imported tree and runtime pending.
- P002: Agy designated sole engine/render/UI owner; Haunted behaviors adapt selectively, not merged. Behavior transfer pending.
- P003: save validation and confirmation defects present in Agy foundation; corrective implementation pending.
- P004: full solo Last Midnight journey pending browser proof.
- P006: actual browser performance baseline and matched after-trace pending.

## Known source-level defects and risks
- Agy src/engine/saveManager.ts importSaveJson writes to localStorage before confirmation in SettingsModal.
- Agy validateSaveObject checks shallow shape; malformed nested object may pass validation.
- Source WebSocket server trusts a client-supplied playerId as identity; Firestore client computes authoritative state. Do not claim multiplayer secure.
- No documented passing build or browser runtime execution for this new repo yet.

## Rollback and data safety
- Preserve the bootstrap main commit and import commit as separate checkpoints; never force-push or erase a source repo.
- Do not rewrite existing user localStorage keys or in-place migrate saves without compatibility fixtures and backup.
- Every phase needs actual typecheck, focused tests, build and browser evidence where available; unexecuted checks remain UNKNOWN.
