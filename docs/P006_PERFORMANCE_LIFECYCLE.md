# P006 — Three.js Performance and Lifecycle Evidence
Date: 2026-11-22. Status: **INCOMPLETE / WATCH**, not an optimization pass.

## Identity
- Target: [westkitty/Haunted_Exploration](https://github.com/westkitty/Haunted_Exploration), integration branch `integration/agy-haunted-p001-p003`.
- Instrumented code capture commit: `b415d0f6b250e0c558cf28c19dbce93034ec7167`.
- CI source: [run 45009378423](https://github.com/westkitty/Haunted_Exploration/actions/runs/45009378423), browser job `137168135072`.
- Raw JSON evidence (expires 2026-12-06): [artifact 14749810208](https://github.com/westkitty/Haunted_Exploration/actions/runs/45009378423/artifacts/14749810208), `p006-baseline-b415d0f6b250.json`.
- Origin `http://127.0.0.1:4173/?perf=1` on the CI runner, Vite **development build**; no deployed server or hardware-device claims.
- Chromium on GitHub-hosted Ubuntu 26.04, viewport 1280x720, DPR 1, WebGL software renderer (SwiftShader flags), postprocessing disabled by fallback policy; seed `P004-LMID-005`.
- Scenario `p006-loopback-menu-midnight-return-v1`, contract revision 2, five 30s phases: menu; Last Midnight; returned menu; resumed Last Midnight; returned menu.
- Capture method: opt-in method in the pre-existing `MansionSceneManager` frame loop, `renderer.info` and Chromium CDP. No second render loop.

## Protected purpose
Maintain the intact haunted mansion exploration, 3D rendering, four Revelations, game save/import/resume, archival endings, keyboard/touch affordances and accessibility, soundtrack/captions. Never claim software fallback speed represents real GPU devices. Neither original repository, target `main`, save schema nor multiplayer trust boundary were modified by P006.

## Measurements
All phases 30 seconds. Intervals are **milliseconds between rendered loop iterations**, not GPU execution timestamps.

| Phase | Frame samples | Frame p50 | Frame p95 | JS simulation mean | Render submission mean | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Menu initial | 16 | 1487.0 | 1890.3 | 0.175 | 5.263 | 479 | 54,880 |
| Last Midnight initial | **10** | 2199.5 | 3229.0 | 0.240 | 5.640 | 503 | 64,812 |
| Menu after first return | 18 | 1471.1 | 2324.3 | 0.133 | 5.106 | 473 | 52,802 |
| Last Midnight resumed | 12 | 2115.1 | 3394.7 | 0.142 | 5.150 | 506 | 65,054 |
| Menu after second return | 14 | 1642.6 | 2593.2 | 0.100 | 4.871 | 474 | 53,454 |

- All sampled frame intervals exceeded 50 ms, as expected from the deliberately throttled software renderer; hardware 33.3 ms p95 and 60 ms p99 exploratory budgets **DO NOT APPLY** to this workload.
- One scenario phase has only 10 frames vs the **predeclared 12 minimum**, so the capture verdict is `incomplete`. Its p95/p99 are exploratory statistics, not a sound benchmark gate.
- Main-thread CDP `TaskDuration` over each 30-second phase was about 0.18–0.37 seconds (not GPU time). JS heap measurements ranged about 26–31 MB.
- First menu became operable at ~4,284 ms in the hosted browser run. It is a CI startup observation, not the time for first visible GPU pixel or mobile startup.

## Renderer resource lifecycle (renderer.info only)
| Phase | Geometries | Textures | Shader programs |
| --- | ---: | ---: | ---: |
| Initial menu | 129 | 36 | 33 |
| First Last Midnight load | 154 | 39 | 33 |
| After first return | 157 | 39 | 33 |
| Resumed Last Midnight | 157 | 39 | 33 |
| After second return | 157 | 39 | 33 |

- After return: **+28 geometries** and **+3 textures** versus the initial menu. Geometries exceed the provisional <=5 growth allowance. Textures meet the provisional <=3 allowance.
- **No further geometries, textures, or programs were added by the second load/unload.** This looks like one-time retained content or warm caches, not proven progressive leakage. The exact ownership and expected lifetime remain unverified.
- `renderer.info` cannot prove GPU native memory, browser caches, audio/listener cleanup or memory lost to the driver.

## Findings and narrow experiments
**P006-F01 — Software WebGL fallback draws extremely slowly in CI.** Evidence: interval p50 ~1.5 s menu and ~2.1–2.2 s Revelation with 473–506 draw calls, yet CPU simulation ~0.1–0.24 ms and draw submission ~5 ms. The code's software GL path uses a GPU fence poll and an additional 80 ms pause; measured intervals are far beyond 80 ms. **Inference only:** fallback GPU rasterization/fence wait dominates, not the deterministic rules. Reproduce on a representative real-GPU desktop and independently compare viewport/resolution under the **same build** before changing quality or rendering architecture. Owner: Three.js engineer. No rendering reduction approved or applied.

**P006-F02 — First load/unload retains a finite geometry/texture set.** Evidence: initial menu 129/36, after first return 157/39, stable after second return. Inspect scene graph reference ownership, global/shared cached geometries and procedural textures in `src/three/roomBuilder.ts`, and scene manager disposal; add repeated cycles for meaningful leak proof. Do **not** dispose global/shared geometry blindly or claim a leak from one step-up. Owner: Three.js engineer.

**P006-F03 — Browser capture sample confidence insufficient.** 10 frames in first Midnight phase, minimum 12. Retain raw observations; future probe should either use longer representative captures or actual GPU hardware where the fallback does not impose ~1–3 second frame intervals. Do not lower thresholds merely to declare PASS. Owner: performance lifecycle auditor.

## Evidence and release verdict
- **Verified:** standard engine/save/typecheck/build and previously proven P003/P004 Chromium journeys remain green in run 45009378423; current opt-in instrumentation did not introduce a second rendering loop.
- **Observed:** software fallback mode, measured loop frame intervals, CPU submission samples, renderer.info resource counts, and browser first-menu operation.
- **Inferred:** GPU fence/rasterization as the likely dominating cost; finite caches rather than progressive leak.
- **Unknown:** GPU execution timings, real-GPU browser experience, hardware desktop/mobile frame distributions, sustained thermal behavior, any speedup, complete listener/audio/native resource recovery.
- **Verdict:** `INCOMPLETE` for the 1280x720 P006 baseline due strict sample and geometry-budget concerns. No after/before speedup or release readiness claim.
- **Rollback:** pre-P006 project checkpoint `832bdec0f4cdebc7f093646584f3f8e73c1dfe45`; instrumentation is gated to explicit local dev `?perf=1` and can be reverted on the integration branch without changing the original repositories.
- **Next bounded pass:** inspect shared geometry/texture ownership and capture on an actual accelerated browser/device; repeat matched scenario, then consider one reversible optimization with visual parity proof. Neither performance pass nor architecture replacement is authorized by current evidence.

## CI handling
P006 is an exploratory strict capture, not a gameplay release requirement; its failure must remain visible and its raw evidence must be preserved. Routine push CI runs the existing P003/P004 browser gate. A **manual `workflow_dispatch`** run additionally invokes this P006 benchmark and uploads the raw JSON artifact. This prevents an inconclusive software-fallback measurement from misrepresenting passing gameplay checks or multiplying CI expense on documentation edits.

## Hardware-access continuation addendum (2026-11-22)

**Current outcome:** hardware measurement BLOCKED by environment, not by a failed GPU benchmark. DEX//REACH reported `[]` online nodes. Desktop Commander listed MacBook Air offline. No remote execution took place and no new performance increase is claimed.

The read-only source audit found module-level `_geoCache` geometry keyed by shape/dimensions/segments and tagged `userData.shared`, plus shared plaque/material caches and WeakMap-per-texture bundles. `disposeObjectTree` intentionally excludes shared geometry and materials, so the observed initial-step resource growth is compatible with reuse. Its full memory lifetime across different procedural seeds and repeated manager creation has **not** been verified; do not call it a fixed or confirmed leak.

Added a hardware-gated, executable on-device handoff in [P006_HARDWARE_MEASUREMENT_HANDOFF.md](P006_HARDWARE_MEASUREMENT_HANDOFF.md), with `scripts/run_p006_hardware.sh` for identity-checked macOS Chrome measurement and `scripts/compare_p006_hardware.mjs` for matched evidence. The hardware mode refuses software/virtual GL identifiers and captures per-phase screenshots for human continuity review. `getSharedRoomCacheStats()` is read-only and available only through the dev-only `?perf=1` measurement handle. **No visual quality or rendering policy changed.**

Provisional after/before requirement: same real GPU, OS, browser version, viewport, DPR, default quality, seed, scenario phase order and capture duration, plus green full-game CI and manual screenshot parity. With no hardware baseline, no performance fix or release verdict is supportable.
