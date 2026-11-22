# P006 — Browser performance benchmark contract

Status: **baseline measurement**, no performance improvement claim yet. Revision 2 extends sample duration after a 30-second pilot returned only three frames on 1280x720 software WebGL; that capture was invalid for percentiles, not a passing result.
Target: `westkitty/Haunted_Exploration` branch `integration/agy-haunted-p001-p003`.
Protected baselines: prior P003 and P004 green evidence, save schema v1 and keys, all four scenario definitions, six Agy character identities, two camera modes, audio/captions, and the existing `MansionSceneManager` frame-loop owner.

## Deterministic scenario

`p006-loopback-menu-midnight-return-v1` (contract revision 2: 30-second phases; same camera, workload and device policy)

- Chrome/Chromium launched headless with the same SwiftShader software-rendering flags as previous browser QA
- Ubuntu GitHub-hosted runner, 1280x720 CSS px, DPR 1, local Vite HTTP loopback, no external backend
- Stage A: initially loaded menu preview; 30 seconds sampled steady
- Stage B: import the legal `P004-LMID-005` Last Midnight Revelation save (seven discovered rooms); 30 seconds sampled steady
- Stage C: return to study/menu preview; 30 seconds sampled steady
- Stage D: resume the saved Last Midnight expedition; 30 seconds sampled steady
- Stage E: return to study/menu again; 30 seconds sampled steady
- Capture loop owner: **original** `MansionSceneManager.startLoop()`. Opt-in `?perf=1` capture API exists only in the Vite development build. The production bundle exposes no benchmark handle.
- Capture: per-frame interval, simulation CPU time, render-submission CPU time; per-phase WebGL geometry, texture, program, calls and triangles; Chromium CDP TaskDuration, ScriptDuration, LayoutDuration, heap size when available; startup/first-menu-ready timing.
- Hardware/software GL, postprocessing state, canvas size, DPR, Chrome version, CPU type, OS, memory and exact SHA recorded with every run.
- Repeat the same steps, browser flags and quality conditions for a candidate before claiming an improvement. Runner hardware changes break strict comparability.

## Provisional budgets declared before first capture

- Hardware WebGL: p95 frame interval <=33.3 ms and p99 <=60 ms; frames >50 ms require investigation. These are exploratory desktop budgets, **not** proven project release criteria.
- Software GL: at least 12 frames per 30s phase; its intentional GPU fence + >=80ms delay makes hardware FPS budgets inapplicable.
- Nonincreasing menu-state GPU resources after two load/unload cycles: geometry growth <=5 and texture growth <=3 vs initial preview, subject to renderer cache caveats.
- Minimum sample count for hardware: 60/phase; no quality reduction is an acceptable optimization without separate approval.
- GPU execution time, mobile thermal, listener/audio cleanup and extended-session stability are explicitly **UNKNOWN** unless measured separately.

## Acceptance and rollback

Baseline must produce raw JSON evidence, percentile summaries and all five phases. Insufficient captures still write raw JSON with status `insufficient-samples` and fail only after saving all evidence; fail if a capture is missing, if the game cannot return to menu/resume, or if unhandled browser exceptions occur. A slower capture is a diagnosis, not automatically a regression. Only optimize against an observed bottleneck. Preserve original source and target `main`. Roll back a candidate with scoped revert on this integration branch, never force-push.
