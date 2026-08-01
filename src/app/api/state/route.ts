// Server-side state store — self-hosted persistence (Mac mini today, AWS later).
// The whole app snapshot (one JSONB-like blob per site + an optimistic-lock rev) is
// kept in a file on the SERVER's disk, so every browser on the network shares the same
// live data and it survives browser clears. Same snapshot+rev semantics as Supabase.
//
// Enable by setting NEXT_PUBLIC_BACKEND=http (and running `next start`, not static export).
// Storage dir: NG_DATA_DIR (default <cwd>/.ngdata). Optional guard: NG_STATE_TOKEN.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.NG_DATA_DIR || path.join(process.cwd(), ".ngdata");
const fileFor = (site: string) => path.join(DATA_DIR, `${site.replace(/[^a-z0-9_-]/gi, "_")}.json`);

type Snap = { rev: number; state: unknown };

async function readSnap(site: string): Promise<Snap | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(site), "utf8")) as Snap;
  } catch {
    return null;
  }
}

// serialise writes per-site within this Node process (a single Mac mini server is one process)
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(site: string, fn: () => Promise<T>): Promise<T> {
  const prev = (locks.get(site) as Promise<unknown> | undefined) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(site, next.catch(() => {}));
  return next as Promise<T>;
}

function authed(req: NextRequest): boolean {
  const need = process.env.NG_STATE_TOKEN;
  if (!need) return true; // no token configured → open (fine on a private LAN)
  const got = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-state-token");
  return got === need;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const site = url.searchParams.get("site") || "default";
  const snap = await readSnap(site);
  if (url.searchParams.get("peek")) return NextResponse.json({ rev: snap?.rev ?? null });
  return NextResponse.json(snap ?? null);
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const site = url.searchParams.get("site") || "default";
  const body = (await req.json()) as { state: unknown; expectedRev: number };
  return withLock(site, async () => {
    const cur = await readSnap(site);
    const curRev = cur?.rev ?? 0;
    // optimistic lock: if someone else wrote since the caller loaded, reject → it re-pulls
    if (cur && curRev !== body.expectedRev) return NextResponse.json({ ok: false, rev: curRev });
    const rev = curRev + 1;
    await fs.mkdir(DATA_DIR, { recursive: true });
    // atomic-ish write: temp file then rename
    const tmp = fileFor(site) + ".tmp";
    await fs.writeFile(tmp, JSON.stringify({ rev, state: body.state }));
    await fs.rename(tmp, fileFor(site));
    return NextResponse.json({ ok: true, rev });
  });
}
