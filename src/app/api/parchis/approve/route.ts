// Approve / reject / reset parchi photos (single or bulk) from /dashboard → Approvals.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "rejected"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; status?: unknown; by?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  const status = STATUSES.find((s) => s === body.status);
  const by = typeof body.by === "string" ? body.by.trim().slice(0, 60) : "";
  if (!ids.length || ids.length > 500 || !status) return NextResponse.json({ error: "ids (1-500) and valid status required" }, { status: 400 });
  if (status !== "pending" && !by) return NextResponse.json({ error: "evaluator name required" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const patch = status === "pending"
    ? { approval_status: status, approved_by: null, approved_at: null }
    : { approval_status: status, approved_by: by, approved_at: new Date().toISOString() };
  const { data, error } = await sb.from("parchi_photos").update(patch).in("id", ids).select("id,approval_status,approved_by,approved_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data });
}
