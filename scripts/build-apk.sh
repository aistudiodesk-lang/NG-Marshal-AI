#!/usr/bin/env bash
# Build the NG Marshal field app APK.
#   ./scripts/build-apk.sh            → dist/NG-Marshal-<version>.apk (debug-signed, sideloadable)
#
# CONNECTING THE APK TO THE WEB CONSOLE (shared data):
#   The APK is a static bundle, so it has NO /api/state of its own — it must be told
#   where the shared server lives at BUILD time. Set NEXT_PUBLIC_STATE_URL to the server
#   the web console runs on (the Mac mini's LAN address, or a public/cloud URL):
#
#     NEXT_PUBLIC_STATE_URL="http://192.168.1.50:3000" ./scripts/build-apk.sh
#     NEXT_PUBLIC_STATE_URL="https://ng.example.com" NEXT_PUBLIC_STATE_TOKEN="secret" ./scripts/build-apk.sh
#
#   With no NEXT_PUBLIC_STATE_URL the APK builds STANDALONE (on-device storage only —
#   not connected to the console). See docs/CONNECT-APP-AND-WEB.md.
#
# Toolchain (installed via Homebrew, no Android Studio):
#   openjdk@21 + android-commandlinetools (+ platform-tools, platforms;android-35, build-tools;35.0.0)
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

VERSION=$(node -p "require('./package.json').version")
APK_OUT="dist/NG-Marshal-v${VERSION}.apk"

# Connection mode. Two ways the APK connects to the shared data:
#   (a) server.url in capacitor.config.ts → the app LOADS the live site (e.g. Vercel),
#       so it shares whatever that site's backend shares. No STATE_URL needed.
#   (b) bundled static export + NEXT_PUBLIC_STATE_URL → offline-capable shell that syncs
#       to a self-host http server. Used when server.url is NOT set.
STATE_URL="${NEXT_PUBLIC_STATE_URL:-}"
SERVER_URL_LINE="$(grep -oE 'url:\s*SERVER_URL|url:\s*"https?://[^"]+"' capacitor.config.ts 2>/dev/null || true)"
if [ -n "$STATE_URL" ]; then
  export NEXT_PUBLIC_BACKEND=http
  export NEXT_PUBLIC_STATE_URL="$STATE_URL"
  [ -n "${NEXT_PUBLIC_STATE_TOKEN:-}" ] && export NEXT_PUBLIC_STATE_TOKEN
  echo "🔗 BUNDLED + CONNECTED build — offline shell syncing to: $STATE_URL"
elif [ -n "$SERVER_URL_LINE" ]; then
  echo "🌐 LIVE-SITE build — the app loads the site set in capacitor.config.ts (server.url)."
  echo "    Data is shared via that site's backend. Web/UI changes appear WITHOUT rebuilding the APK."
else
  echo "⚠️  STANDALONE build — no server.url and no NEXT_PUBLIC_STATE_URL; APK will NOT share data."
  echo "    Connect via either capacitor server.url (live site) or NEXT_PUBLIC_STATE_URL (self-host)."
fi

echo "── 1/4 static export (api routes excluded — unsupported in export mode)"
restore_api() { [ -d /tmp/ngm-api-backup ] && rm -rf src/app/api && mv /tmp/ngm-api-backup src/app/api || true; }
trap restore_api EXIT
rm -rf /tmp/ngm-api-backup
[ -d src/app/api ] && mv src/app/api /tmp/ngm-api-backup
rm -rf .next out
NEXT_OUTPUT=export npx next build
restore_api
trap - EXIT

echo "── 2/4 capacitor sync"
[ -d android ] || npx cap add android
npx cap sync android

echo "── 3/4 gradle assembleDebug"
cd android
./gradlew --quiet assembleDebug
cd ..

echo "── 4/4 collect apk"
mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk "$APK_OUT"
echo ""
echo "✓ APK ready: $APK_OUT ($(du -h "$APK_OUT" | cut -f1 | tr -d ' '))"
