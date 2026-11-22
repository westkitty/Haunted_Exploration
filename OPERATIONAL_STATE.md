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
- P001: source pins verified and 54 Agy source blobs transplanted with original relative paths; 59-file initial integration commit verified; actual runtime test pending. Original sources not mutated.
- P002: source ownership documented in docs/ARCHITECTURE_DECISIONS.md; Agy designated sole engine/render/UI owner; no Haunted source wholesale merged. Narrative canon decisions pending.
- P003: side-effect-free import, 1 MiB file limit, structural validator, deterministic regression script and workflow committed to integration branch. Tests and build NOT YET EXECUTED; GitHub Actions runs listing was empty at last check. Storage quota UI warning and full validation proof remain pending.
- P004: full solo Last Midnight journey pending browser proof.
- P006: actual browser performance baseline and matched after-trace pending.

## Known source-level defects and risks
- Original Agy src/engine/saveManager.ts importSaveJson wrote to storage before confirmation. Third-version branch changes it to a pure stage operation; correctness pending tests.
- Original Agy validateSaveObject checked shallow shape. Third-version branch adds nested topology validation; correctness and existing-save compatibility pending tests.
- Source WebSocket server trusts a client-supplied playerId as identity; Firestore client computes authoritative state. Do not claim multiplayer secure.
- No documented passing build or browser runtime execution for this new repo yet. Workflow file exists but zero runs were returned; no green claim.

## Rollback and data safety
- Preserve the bootstrap main commit and import commit as separate checkpoints; never force-push or erase a source repo.
- Do not rewrite existing user localStorage keys or in-place migrate saves without compatibility fixtures and backup.
- Every phase needs actual typecheck, focused tests, build and browser evidence where available; unexecuted checks remain UNKNOWN.

## Current branch checkpoint
- Verified branch head after workflow addition: `2a02b1b7359579ad64ca13579ae892fdcfdcf32f`.
- Main remains the README-only bootstrap commit `070f059b3a05610a68ea6dcdc98143d030005957`.
- Preserved original source blobs in independent GitHub repositories; source content imports exclude `public/assets/aistudio/*` and original Firebase project config, which is replaced with a disabled empty placeholder.
- Test commands when a Bun environment is available: `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:save`, `bun run test:engine`, `bun run build`.
- CI workflow exists at `.github/workflows/verify.yml`, but GitHub's run listing contained zero runs at the time of checking; CI status is UNKNOWN, not PASS.
- Do not merge to main or deploy until the above tests and an end-to-end browser solo expedition pass.
