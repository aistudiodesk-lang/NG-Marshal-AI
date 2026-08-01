// Event-driven auto-ingest: Composio's GMAIL_NEW_GMAIL_MESSAGE trigger POSTs here
// whenever a new Adani pendency mail lands in mis1.navingroup@gmail.com. We ignore
// the payload and just run the same idempotent sync (checkpoint-guarded), which pulls
// the newest import/export attachment straight into the shared pool.
//
// No cron on our side, and it does NOT use the ingest key — a dedicated
// GMAIL_WEBHOOK_TOKEN (baked into the webhook URL configured in Composio) guards it.
import { NextRequest, NextResponse } from "next/server";
import { runGmailSync } from "@/lib/gmailSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.GMAIL_WEBHOOK_TOKEN;
  if (!secret) return true; // no token configured → open (idempotent, source-of-truth is Gmail)
  const url = new URL(req.url);
  const got =
    url.searchParams.get("token") ??
    req.headers.get("x-webhook-token") ??
    req.headers.get("x-composio-secret");
  return got === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runGmailSync();
    return NextResponse.json({ ok: true, source: "composio-trigger", ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Composio delivers via POST; GET kept for manual pings / connectivity checks.
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
