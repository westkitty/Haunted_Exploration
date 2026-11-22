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
- P001: source pins and original-source preservation verified; 54 Agy source blobs imported into the third repository with relative paths; independent Bun builds and real Chromium runtime smoke tests passed (CI run 45008149328).
- P002: source ownership documented in docs/ARCHITECTURE_DECISIONS.md; Agy designated sole engine/render/UI owner; no Haunted source wholesale merged. Narrative canon decisions pending.
- P003: VERIFIED for scoped solo saving/import. Side-effect-free import; 1 MiB limit; deep nested save checks; both Main Menu and Settings import cancel retain byte-identical old save; storage-denied autosave yields persistent warning and manual JSON recovery download; failed archive write does not delete saved ending. Bun tests and real Chromium proof passed on d4e6206e3e46258e6145f25ff439fa7c3d141ebf (Actions run 45008149328, Chromium 157.0.8103.78).
- P004: VERIFIED for bounded Last Midnight solo scope: natural seed P004-LMID-005 triggers at turn 2 via legal actions; 3 distinct reachable clocks, victory turn 4, countdown loss turn 13, mid-Revelation save/resume, archived endings, visible 2D map/HUD navigation, main-menu return. Both engine and real Chromium tests passed in Actions run 45008149328. Other scenarios remain unchanged in code; device/manual experience review still outstanding.
- P006: instrumented five-phase Chromium/SwiftShader **diagnostic** captured in run 45009378423 at code commit b415d0f6b250e0c558cf28c19dbce93034ec7167; raw JSON artifact 14749810208; verdict INCOMPLETE (first Revelation phase only 10 frames versus predeclared 12 minimum). Menu 30s p50 1487ms, Revelation 2200ms; software renderer GPU-fence pacing likely dominates, CPU simulation 0.10-0.24ms/observed frame; CPU render submission ~4.9-5.6ms. One-time after-unload renderer.info growth +28 geometries and +3 textures, flat over second load/unload (may reflect caches, root cause unproven). See docs/P006_PERFORMANCE_LIFECYCLE.md. No rendering or quality optimization shipped, no matched before/after or hardware verdict. Performance capture moved to manual workflow_dispatch so routine regression CI remains the release-relevant gate.

## Known source-level defects and risks
- Original Agy import-before-confirm data-loss defect is fixed and verified in third-version tests; source Agy remains unchanged.
- Original Agy shallow save validation is replaced in third-version by nested/graph checks; v1 round-trip, malformed nested rejection and live Chromium import/cancel/resume cases passed. Broad historical-save compatibility beyond exercised v1 fixtures remains unproven.
- Source WebSocket server trusts a client-supplied playerId as identity; Firestore client computes authoritative state. Do not claim multiplayer secure.
- GitHub Actions browser+engine validation passed for d4e6206e3e46258e6145f25ff439fa7c3d141ebf (run 45008149328). Further manual, mobile/accessibility-device, audible sound, and P006 performance checks remain UNVERIFIED.

## Rollback and data safety
- Preserve the bootstrap main commit and import commit as separate checkpoints; never force-push or erase a source repo.
- Do not rewrite existing user localStorage keys or in-place migrate saves without compatibility fixtures and backup.
- Every phase needs actual typecheck, focused tests, build and browser evidence where available; unexecuted checks remain UNKNOWN.

## Current branch checkpoint
- Last verified implementation/test head with passing CI: `d4e6206e3e46258e6145f25ff439fa7c3d141ebf` (Actions run 45008149328).
- Main remains the README-only bootstrap commit `070f059b3a05610a68ea6dcdc98143d030005957`.
- Preserved original source blobs in independent GitHub repositories; source content imports exclude `public/assets/aistudio/*` and original Firebase project config, which is replaced with a disabled empty placeholder.
- Test commands when a Bun environment is available: `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:save`, `bun run test:engine`, `bun run build`.
- Current CI workflow at `.github/workflows/verify.yml` passed on d4e6206: https://github.com/westkitty/Haunted_Exploration/actions/runs/45008149328. Both standard verify and real Chromium browser jobs passed. Prior browser infrastructure failures were confined to npm peer resolution and unsupported browser download; fixed by using isolated test-only install and runner system Chrome.
- No merge or deployment authorized. P003/P004 browser gates are passed, but P006 measured performance, public multiplayer security (P005/P007), manual/mobile UX/audible audio QA and any release authorization remain open.

## P003/P004 evidence (2026-11-22)
- Source: `scripts/verify_save_import.ts` and `scripts/verify_last_midnight.ts`; end-to-end: `scripts/browser_expedition.mjs`.
- PASS: 45007917537 (initial browser journey), 45008149328 (expanded Settings import cancellation).
- Browser: system Chrome / Chromium `157.0.8103.78`, runner Ubuntu 26.04, served via loopback Vite only. No deployment, no live cloud backend.
- Archive and storage failure protections validated for tested paths; see `docs/P003_P004_QA_EVIDENCE_2026-11-22.md`.
- No P006 performance proof, and do not infer real-player feel or all-device support from headless Chromium.

## P006 continuation checkpoint
- Baseline before instrumentation: `832bdec0f4cdebc7f093646584f3f8e73c1dfe45`; instrumentation: `46d5da8e5d3df9853ca280d94f6432d01582e5de`.
- Initial 6.5s exploratory capture 45009113378 failed minimum 12 frames; 30s re-sampling 45009378423 produced five phases but one low-confidence phase (10 frames). Both intentionally BLOCK claims of measured performance pass.
- Code `scripts/browser_performance.mjs` and `?perf=1` dev-only handle remain for strict future capture. The report retains exact results and hypotheses. P003/P004 still passed the standard verification and Chromium UI replay on both diagnostic runs.
- GitHub Actions normal push continues P003/P004 regression. Manual `workflow_dispatch` opts into heavy P006 diagnostic and artifact upload; this change prevents inconclusive test-only sampling from masking the healthy gameplay gate.

## P006 accelerated-GPU handoff and shared-cache investigation (2026-11-22)

- **GPU execution environment:** DEX//REACH `reach_list_nodes` returned no online nodes. Remote Desktop Commander listed `MacBook-Air.local` as offline. No authorized real-GPU Mac was accessible or executed in this turn; there is **no new hardware baseline**, before/after comparison or performance uplift.
- **Existing machine evidence:** Ubuntu CI uses headless SwiftShader/software WebGL. The five-phase software result remains `INCOMPLETE` with 10 first-Revelation frames vs the locked minimum of 12. Do not reinterpret it as accelerated-GPU performance.
- **Source inspection:** `src/three/roomBuilder.ts` `_geoCache` holds keyed geometries with `userData.shared`. The disposer intentionally skips shared geometry/materials; nameplate material cache also holds generated shared CanvasTextures keyed by room name/floor; per-texture bundles use WeakMaps. The prior +28 geometries/+3 textures after first return stayed flat on the second return, consistent with warming but not proof of safe long-term memory.
- **Changes:** added read-only `getSharedRoomCacheStats()`, wired only into the opt-in `?perf=1` probe; expanded sampled-frame capacity to 4000; added hardware Chrome mode with `WEBGL_debug_renderer_info` positive identity gate; no forcing software flags in hardware mode. Added `scripts/run_p006_hardware.sh` and `scripts/compare_p006_hardware.mjs` with identity/workload safeguards and no auto release verdict.
- **Handoff:** `docs/P006_HARDWARE_MEASUREMENT_HANDOFF.md` gives an exact clone + on-device run sequence, required machine confirmation, output paths, strict matched-comparison rules, and zero remote execution claims. Only an authorized Mac may run it.
- **Validation:** GitHub Actions `45011127404` verified the script syntax gate, TypeScript, save tests, engine tests, deterministic Last Midnight, and production build. At the time of authoring, its Chromium gameplay job was still in progress; final run status must be checked again before closure.
- **Decision:** **NO OPTIMIZATION**. No source-quality, save, game-rule, cloud, renderer lifecycle or shared-resource disposal changes were justified. Hardware measurements, multiple-scenario cache growth and visual comparisons remain outstanding.
- **Safe rollback baseline:** `bdbeb44cb0b6f1fbc8f65f1955016180409bba10` (before current diagnostic-only code changes). Keep all work on `integration/agy-haunted-p001-p003`; no force push, merge or deploy.

## P006 local Bun compatibility failure (2026-11-22)
- User's MacBook Air clone at `/Users/andrew/Haunted_Exploration_P006` correctly identified host `MacBook-Air.local`, authorized integration branch and head `1fb2311fffb387378247e1f1ac4ef2ef42add5cf`; Chrome 157.0.8103.79; Bun 1.3.13. Install aborted before browser start because the committed `bun.lock` `lockfileVersion: 2` was unknown to that old Bun. **P006 hardware result still UNKNOWN.**
- Guard added: `scripts/run_p006_hardware.sh` checks known-compatible Bun 1.4.5+ before any dependency download. Lockfile unchanged. DEX//REACH confirmed root/branch/remote but refused a diagnostic shell command due high CPU pressure; no remote mutation performed.
