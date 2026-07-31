// Scheduled auto-ingest of the Adani pendency feed from Gmail (via Composio).
// Triggered by Vercel Cron (see vercel.json) or manually.
// Auth: shared INGEST_TOKEN (?token= or x-ingest-token header), or Vercel Cron's bearer.
import { NextRequest, NextResponse } from "next/server";
import { runGmailSync } from "@/lib/gmailSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-ingest-token");
  if (process.env.INGEST_TOKEN && token === process.env.INGEST_TOKEN) return true;

  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;

  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runGmailSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
