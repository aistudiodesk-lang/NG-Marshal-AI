import { DataStore } from "./DataStore";
import { localStore } from "./localStore";

// Backend selection — the ONLY place the app decides where data lives.
//   "local"    (default) — this browser's storage. Single machine, no sharing.
//   "http"     — a server that persists to disk (self-host on a Mac mini, then AWS).
//                Shared across every browser on that server; survives browser clears.
//   "supabase" — Supabase cloud database (Vercel hosting).
export function getDataStore(): DataStore {
  const backend = process.env.NEXT_PUBLIC_BACKEND ?? "local";
  if (backend === "http") {
    const { httpStore } = require("./httpStore") as typeof import("./httpStore"); // eslint-disable-line @typescript-eslint/no-require-imports
    return httpStore;
  }
  if (backend === "supabase") {
    // lazy require keeps supabase-js out of the bundle in local mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabaseStore } = require("./supabaseStore") as typeof import("./supabaseStore");
    return supabaseStore;
  }
  return localStore;
}
