// Office dashboard feed — every parchi's extracted fields (no images) for an IST date
// range, optionally one driver. Aggregation happens client-side on /dashboard.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const from = p.get("from") || istToday();
  const to = p.get("to") || from;
  const driver = p.get("driver");
  if (!DAY.test(from) || !DAY.test(to)) return NextResponse.json({ error: "bad date" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  // ponytail: one query capped at 10k rows; paginate if a range ever holds more
  let q = sb
    .from("parchi_photos")
    .select("id,driver_id,driver_name,captured_at,parchi_type,container_no,container_valid,iso_code,size_ft,gate_pass_no,cycle,doc_datetime,vehicle_no,seal_no,transporter,revenue,revenue_eligible,ocr_at,storage_path,approval_status,approved_by,approved_at")
    .gte("captured_at", `${from}T00:00:00+05:30`)
    .lte("captured_at", `${to}T23:59:59+05:30`)
    .order("captured_at", { ascending: false })
    .range(0, 9999);
  if (driver) q = q.eq("driver_id", driver);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // full driver list (for the filter dropdown) regardless of range
  const { data: all } = await sb.from("parchi_photos").select("driver_id,driver_name").range(0, 9999);
  const drivers = [...new Map((all ?? []).map((r) => [r.driver_id, r.driver_name])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // short-lived signed photo URLs (private bucket) for the Approvals viewer
  const rows = data ?? [];
  const urls = new Map<string, string>();
  for (let i = 0; i < rows.length; i += 500) {
    const { data: signed } = await sb.storage.from("parchis").createSignedUrls(rows.slice(i, i + 500).map((r) => r.storage_path), 3600);
    for (const u of signed ?? []) if (u.signedUrl && u.path) urls.set(u.path, u.signedUrl);
  }
  const out = rows.map(({ storage_path, ...r }) => ({ ...r, url: urls.get(storage_path) ?? null }));

  return NextResponse.json({ from, to, rows: out, drivers });
}
