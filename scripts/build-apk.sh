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

# Connection mode — bake the shared backend into the static bundle if a server URL is given.
STATE_URL="${NEXT_PUBLIC_STATE_URL:-}"
if [ -n "$STATE_URL" ]; then
  export NEXT_PUBLIC_BACKEND=http
  export NEXT_PUBLIC_STATE_URL="$STATE_URL"
  [ -n "${NEXT_PUBLIC_STATE_TOKEN:-}" ] && export NEXT_PUBLIC_STATE_TOKEN
  echo "🔗 CONNECTED build — phone will sync with: $STATE_URL"
else
  echo "⚠️  STANDALONE build — no NEXT_PUBLIC_STATE_URL set; APK will NOT share data with the console."
  echo "    To connect: NEXT_PUBLIC_STATE_URL=\"http://<server>:3000\" ./scripts/build-apk.sh"
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
