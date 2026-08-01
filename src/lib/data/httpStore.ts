import { DataStore, Snapshot, SaveResult } from "./DataStore";

// Talks to the server-side /api/state route (see src/app/api/state/route.ts).
// Data lives on the SERVER's disk, so every browser hitting this server shares it.
// Same-origin by default; NEXT_PUBLIC_STATE_URL can point at another host (e.g. the
// Mac mini's LAN address, or an AWS URL later). Optional NEXT_PUBLIC_STATE_TOKEN.
const BASE = process.env.NEXT_PUBLIC_STATE_URL ?? "";
const TOKEN = process.env.NEXT_PUBLIC_STATE_TOKEN ?? "";
const q = (site: string, extra = "") =>
  `${BASE}/api/state?site=${encodeURIComponent(site)}${extra}${TOKEN ? `&token=${encodeURIComponent(TOKEN)}` : ""}`;

export const httpStore: DataStore = {
  name: "http",
  async load(siteId: string): Promise<Snapshot | null> {
    try {
      const r = await fetch(q(siteId), { cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.state != null ? (j as Snapshot) : null;
    } catch {
      return null;
    }
  },
  async save(siteId: string, state: unknown, expectedRev: number): Promise<SaveResult> {
    try {
      const r = await fetch(q(siteId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, expectedRev }),
      });
      if (!r.ok) return { ok: false, rev: expectedRev };
      return (await r.json()) as SaveResult;
    } catch {
      return { ok: false, rev: expectedRev };
    }
  },
  async peekRev(siteId: string): Promise<number | null> {
    try {
      const r = await fetch(q(siteId, "&peek=1"), { cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      return j.rev ?? null;
    } catch {
      return null;
    }
  },
};
