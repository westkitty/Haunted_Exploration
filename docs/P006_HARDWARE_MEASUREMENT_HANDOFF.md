# P006 — accelerated-GPU measurement handoff

**Status: hardware baseline not run.** On November 22, 2026, DEX//REACH returned zero online nodes; Desktop Commander reported the MacBook Air offline. Neither connector provided a verified GPU-capable remote execution target. No application optimization is justified until hardware evidence is available.

## Protected identity

- Writable repo: `westkitty/Haunted_Exploration`, **branch only** `integration/agy-haunted-p001-p003`.
- Before this handoff: `bdbeb44cb0b6f1fbc8f65f1955016180409bba10` (passed CI run `45009923073`). The runner must record the current exact SHA, not silently substitute another checkout.
- Source repositories `Betrayal_Agy` and `Haunted_Betrayal`, target `main`, public multiplayer, save schema, character canon and deployment remain protected.
- Do not substitute SwiftShader, emulated macOS, or an arbitrary hosted browser as accelerated-GPU proof.

## Local Bun lockfile compatibility incident (2026-11-22)

The verified MacBook Air clone at `1fb2311fffb387378247e1f1ac4ef2ef42add5cf` passed environment checks but stopped at `bun install --frozen-lockfile`: Bun `1.3.13` reported `Unknown lockfile version` for `bun.lock` using `lockfileVersion: 2`. The later frozen-lockfile error is a cascade. No GPU/browser measurement ran. The new guard checks Bun before dependency installation.

Use a known-compatible stable Bun `1.4.5` or newer by upgrading it **with its original package manager**. For Homebrew installations use `brew upgrade bun`; for standalone `~/.bun` installations use `bun upgrade --stable`. Check `command -v bun` to establish which install is active. Never delete or regenerate the committed lockfile, bypass `--frozen-lockfile`, or force an npm-only dependency resolution for a measured baseline.

## Hardware requirements

An explicitly selected and authorized macOS desktop with physical GPU acceleration, active GUI session, at least 3 GiB free, Git, Bun, npm and Google Chrome already installed. The shell runner checks hostname, OS, Git origin, branch, clean tracked worktree, optional SHA, disk, Chrome executable and local TCP port before installing dependencies. No operating-system software is installed. Dependencies are installed **only in this benchmark checkout**; browser data and files remain local. No pushes, merges, deletions, deployments or external account changes occur.

### Prepare a dedicated clean checkout on the intended Mac

```bash
git clone --branch integration/agy-haunted-p001-p003 --single-branch https://github.com/westkitty/Haunted_Exploration.git "$HOME/Haunted_Exploration_P006"
cd "$HOME/Haunted_Exploration_P006"
hostname -s
git remote -v
git branch --show-current
git rev-parse HEAD
```

Read these results on the selected machine; confirm the intended host and repository **before** the following execution. The script performs the checks again:

```bash
HAUNTED_EXPECT_HOST="$(hostname -s)" HAUNTED_EXPECT_SHA="$(git rev-parse HEAD)" bash scripts/run_p006_hardware.sh
```

If Chrome lives elsewhere, supply its exact path in `HAUNTED_CHROMIUM_PATH`. The script will refuse to run if Chrome cannot expose a trustworthy non-software `WEBGL_debug_renderer_info` identity or if the app detects software GL. A failed hardware identity check is a BLOCK, not a performance measurement.

## What executes

- Locks the real Mac identity; prints user, hostname, architecture, Git root/remote/branch/SHA and browser version.
- Installs locked Bun dependencies and the test-only Playwright client (no Playwright browser download); verifies package manifests were not edited.
- Starts Vite only on `127.0.0.1:4173` and automatically stops **its own** server on exit.
- Runs the existing opt-in instrumentation at `?perf=1` in **headed Google Chrome**, without `--use-angle=swiftshader` or `--no-sandbox`.
- Captures five 30-second phases: initial menu, Last Midnight fixture (`P004-LMID-005`), return to menu, resume, return again; uses the same 1280×720 CSS viewport and DPR 1.
- Saves timestamped JSON, per-phase PNG screenshots, console log and Vite log in `performance-evidence/`. The shared geometry cache is observed, not disposed.

Hardware budgets were declared before results: p95 frame interval no greater than 33.3 ms, p99 no greater than 60 ms, at least 60 frame samples per phase, no visual quality reduction, and nonincreasing resource counts after settle except documented deliberate caches. The 30-second window is diagnostic, not proof of sustained thermal stability.

## Matched before/after decision

First capture the untouched integration branch as baseline. Only **after** a real, repeatable bottleneck is demonstrated may a single reversible optimization be attempted. Re-run the exact same five-phase scenario on the same Mac, browser version, GPU, viewport, DPR, quality setting, and OS release. To compare:

```bash
bun scripts/compare_p006_hardware.mjs "performance-evidence/BASELINE.json" "performance-evidence/CANDIDATE.json"
```

The comparator refuses invalid captures and different environment/workload identities, prints p50/p95/p99 deltas and retained resource changes, and does **not** automatically certify an improvement. Require repeated measurements where practical, manual screenshot parity review, and green typecheck, save tests, engine tests, Last Midnight tests, production build and Chromium UI regression. Mobile thermals, native GPU memory and full audio/listener disposal remain unknown without separate evidence.

## Shared-cache source inspection

- `src/three/roomBuilder.ts`: module-scoped `_geoCache` keyed by geometry shape/dimensions/segments; cached geometries marked with `userData.shared`.
- `getSharedPlaqueMat(roomName, floor)` stores shared materials with generated CanvasTextures; keys depend on exact room name and floor. Other shared caches include velvet, flask, coat and accent materials.
- `disposeObjectTree` disposes owned per-room meshes/instancing, but explicitly does **not** dispose shared geometries/materials. Per-texture WeakMap bundles cannot be counted by enumeration.
- The earlier software-WebGL run showed +28 geometries and +3 textures after first return, then no further increase after the second. This is consistent with cache warming; it does not establish the lifetime bound across many seeds or repeated mounts.
- Read-only `sharedRoomCache` snapshots were added to the performance probe so future hardware evidence can compare module-cache keys with `renderer.info`. **Do not clear or dispose the cache** without scoped ownership proof.

## Fallback if hardware is still unavailable

Keep P006 **INCOMPLETE** and do not change rendering settings, frame pacing, materials, textures or scene quality based on the software CI result. The runnable handoff and measurement contract are ready; execution is strictly deferred until the user selects and verifies a suitable machine. P003/P004 and their CI remain the protected baseline.
