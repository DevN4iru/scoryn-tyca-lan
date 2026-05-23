#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p logs data
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="logs/run-local-$STAMP.log"

exec > >(tee -a "$LOG") 2>&1

cleanup() {
  echo
  echo "Stopping local Scoryn processes..."
  jobs -pr | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "===== SCORYN TYCA LAN LOCAL RUNNER ====="
date
echo "Project: $ROOT"
echo "Log: $LOG"
echo

echo "===== AUDIT ====="
command -v node >/dev/null || { echo "ERROR: Node.js is missing. Install Node.js first."; exit 1; }
command -v npm >/dev/null || { echo "ERROR: npm is missing. Install npm first."; exit 1; }
node -v
npm -v

echo
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
  else
    cat > .env <<'ENV'
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
ADMIN_PIN=admin2026
DEVELOPER_PIN=dev2026
ENV
    echo "Created minimal .env"
  fi
else
  echo ".env already exists"
fi

echo
if [ -f package-lock.json ]; then
  echo "Installing dependencies with npm ci..."
  npm ci
else
  echo "Installing dependencies with npm install..."
  npm install
fi

echo
if command -v ss >/dev/null; then
  echo "===== PORT CHECK ====="
  ss -ltnp 2>/dev/null | grep -E ':(3001|5173)\b' || echo "Ports 3001 and 5173 look free."
fi

echo
LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "===== STARTING BACKEND API :3001 ====="
npm run api &
API_PID=$!

# Give Express a moment to boot.
sleep 2

if command -v curl >/dev/null; then
  echo "===== API HEALTH CHECK ====="
  curl -fsS http://127.0.0.1:3001/api/health || echo "API health check failed; Vite will still start so you can see the browser error."
  echo
fi

echo "===== STARTING FRONTEND VITE :5173 ====="
echo "Local:   http://127.0.0.1:5173"
if [ -n "${LOCAL_IP:-}" ]; then
  echo "LAN:     http://$LOCAL_IP:5173"
fi
echo
echo "Default login pins:"
echo "  Admin:     admin2026"
echo "  Developer: dev2026"
echo "  Judge:     judge1, judge2, judge3 ... judge8"
echo
echo "Press Ctrl+C to stop both API and frontend."
echo

npm run dev &
VITE_PID=$!

wait -n "$API_PID" "$VITE_PID"
