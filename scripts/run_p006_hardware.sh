#!/usr/bin/env bash
# P006 hardware browser benchmark: no source mutation, commit, push or deploy.
set -euo pipefail
fail() { printf 'BLOCKED: %s\n' "$*" >&2; exit 2; }
EXPECT_HOST="$(printenv HAUNTED_EXPECT_HOST || true)"
[ -n "$EXPECT_HOST" ] || fail 'Set HAUNTED_EXPECT_HOST to the verified machine hostname before execution.'
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'Not inside a Git repository.'
cd "$ROOT"
BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || fail 'Detached HEAD not allowed.'
[ "$BRANCH" = 'integration/agy-haunted-p001-p003' ] || fail "Unexpected branch: $BRANCH"
REMOTE="$(git remote get-url origin 2>/dev/null)" || fail 'Missing origin remote.'
case "$REMOTE" in
  https://github.com/westkitty/Haunted_Exploration|https://github.com/westkitty/Haunted_Exploration.git|git@github.com:westkitty/Haunted_Exploration.git|ssh://git@github.com/westkitty/Haunted_Exploration.git) ;;
  *) fail "Wrong repository origin: $REMOTE" ;;
esac
[ "$(uname -s)" = 'Darwin' ] || fail 'Hardware handoff requires a Mac desktop; Linux CI is not hardware proof.'
SHORT_HOST="$(hostname -s)"
FULL_HOST="$(hostname)"
[ "$EXPECT_HOST" = "$SHORT_HOST" ] || [ "$EXPECT_HOST" = "$FULL_HOST" ] || fail "Wrong machine: expected $EXPECT_HOST, observed $FULL_HOST"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail 'Tracked worktree not clean. Use a separate benchmark checkout.'
SHA="$(git rev-parse HEAD)"
EXPECT_SHA="$(printenv HAUNTED_EXPECT_SHA || true)"
if [ -n "$EXPECT_SHA" ]; then [ "$SHA" = "$EXPECT_SHA" ] || fail "Expected SHA $EXPECT_SHA, observed $SHA"; fi
for command_name in bun npm curl lsof; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done
CHROME_PATH="$(printenv HAUNTED_CHROMIUM_PATH || true)"
if [ -z "$CHROME_PATH" ]; then CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; fi
[ -x "$CHROME_PATH" ] || fail "Chrome desktop executable unavailable: $CHROME_PATH"
FREE_KIB="$(df -Pk . | awk 'NR==2 { print $4 }')"
case "$FREE_KIB" in ''|*[!0-9]*) fail 'Cannot validate free disk space' ;; esac
[ "$FREE_KIB" -ge 3145728 ] || fail "Less than 3 GiB free ($FREE_KIB KiB). Do not install here."
[ ! -e .git/index.lock ] || fail 'Git index is locked.'
if lsof -nP -iTCP:4173 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
  fail 'Port 4173 is occupied; do not attach to an unrelated service.'
fi
printf 'VERIFIED HOST=%s USER=%s ARCH=%s ROOT=%s BRANCH=%s SHA=%s REMOTE=%s\n' \
  "$FULL_HOST" "$(id -un)" "$(uname -m)" "$ROOT" "$BRANCH" "$SHA" "$REMOTE"
"$CHROME_PATH" --version
bun --version
OUT="$ROOT/performance-evidence"
mkdir -p "$OUT"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
LOG="$OUT/p006-local-vite-$STAMP.log"
echo 'Installing locked dependencies and test-only Playwright, without downloading Chromium.'
bun install --frozen-lockfile
npm install --no-save --legacy-peer-deps --package-lock=false --ignore-scripts --no-audit --no-fund playwright@1.55.1
git diff --exit-code -- package.json bun.lock >/dev/null || fail 'Dependency setup altered tracked manifests.'
bunx vite --host 127.0.0.1 --port 4173 --strictPort >"$LOG" 2>&1 &
SERVER_PID="$!"
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
READY=0
for _attempt in $(seq 1 40); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then cat "$LOG" >&2; fail 'Local Vite exited'; fi
  if curl -fsS http://127.0.0.1:4173/ >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
[ "$READY" = 1 ] || fail "Vite never became ready; log: $LOG"
HAUNTED_PERF_MODE=hardware \
HAUNTED_PERF_HEADLESS=0 \
HAUNTED_CHROMIUM_PATH="$CHROME_PATH" \
HAUNTED_TEST_ORIGIN=http://127.0.0.1:4173 \
HAUNTED_PERF_OUT="$OUT" \
GITHUB_SHA="$SHA" \
bun scripts/browser_performance.mjs | tee "$OUT/p006-console-$STAMP.log"
printf 'Hardware capture and phase screenshots are under: %s\n' "$OUT"
echo 'No Git commit, push, deployment or remote cloud action was performed.'
