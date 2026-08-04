import type { CapacitorConfig } from "@capacitor/cli";

// NG Marshal field app — Capacitor native shell around the LIVE web console.
//
// `server.url` points the app at the deployed Vercel site, so the phone loads the
// same web app the browser does. Consequence: every Vercel deploy shows up in the
// installed app automatically — no APK rebuild for web/UI/data changes. (This config
// value itself is baked in at build time, so it takes ONE rebuild to switch the app
// into this live mode; after that, web changes reflect on their own.)
//
// The app's DATA therefore comes from whatever the live site uses (Supabase in prod),
// so real phone numbers log in and the app + console share one dataset.
//
// Trade-off: the app needs network to load (it fetches the live site). For an
// offline-capable build instead, drop `server.url` and bundle the static export
// (`webDir: "out"` via scripts/build-apk.sh) — that syncs data but freezes the UI.
//
// To point at a different environment (a preview URL, or a fresh NG-Marshal Vercel
// project), change SERVER_URL and rebuild once.
const SERVER_URL = "https://ng-marshal-ai.vercel.app";

const config: CapacitorConfig = {
  appId: "com.navingroup.ngmarshal",
  appName: "NG Marshal",
  webDir: "out", // fallback bundle; ignored while server.url is set
  server: {
    url: SERVER_URL,
    cleartext: false, // https only
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
