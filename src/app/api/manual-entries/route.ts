// Manual trip entries made by the approver on /dashboard.
// POST also runs the cross-check: a pending photo with the same day + container
// is auto-approved and linked (see lib/manualMatch).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revenueForSize } from "@/lib/revenue";
import { containerKey, matchEntryToPhoto } from "@/lib/manualMatch";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const str = (v: unknown, max = 60) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const from = p.get("from") ?? "", to = p.get("to") ?? "", driver = p.get("driver");
  if (!DAY.test(from) || !DAY.test(to)) return NextResponse.json({ error: "bad date" }, { status: 400 });

  let q = sb().from("manual_entries").select("*").gte("trip_date", from).lte("trip_date", to).order("trip_date", { ascending: false }).range(0, 4999);
  if (driver) q = q.eq("driver_id", driver);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const trip_date = str(b.tripDate, 10);
  const container_no = str(b.containerNo, 20).toUpperCase();
  const entered_by = str(b.by);
  const sizeFt = b.sizeFt === 20 || b.sizeFt === 40 ? (b.sizeFt as 20 | 40) : null;
  const parchi_type = str(b.parchiType, 40).toUpperCase();
  if (!DAY.test(trip_date)) return NextResponse.json({ error: "valid date required" }, { status: 400 });
  if (!containerKey(container_no)) return NextResponse.json({ error: "container number required" }, { status: 400 });
  if (!entered_by) return NextResponse.json({ error: "evaluator name required" }, { status: 400 });

  const rev = revenueForSize(parchi_type, sizeFt);
  const row = {
    trip_date,
    driver_id: str(b.driverId) || null,
    driver_name: str(b.driverName) || null,
    container_no,
    container_key: containerKey(container_no),
    iso_code: str(b.isoCode, 10) || null,
    size_ft: sizeFt,
    parchi_type: parchi_type || null,
    cycle: str(b.cycle, 20).toUpperCase() || null,
    gate_pass_no: str(b.gatePassNo, 30) || null,
    vehicle_no: str(b.vehicleNo, 30) || null,
    revenue: rev.revenue,
    revenue_eligible: rev.eligible,
    entered_by,
  };

  const client = sb();
  const { data, error } = await client.from("manual_entries").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // background cross-check — auto-approve a matching pending photo from that day
  const matchedPhotoId = await matchEntryToPhoto(client, data as { id: string; trip_date: string; container_key: string; entered_by: string });
  return NextResponse.json({ entry: { ...data, matched_photo_id: matchedPhotoId ?? null }, matchedPhotoId });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // a matched entry's photo stays approved — undo it from the Approvals tab if that's wrong
  const { error } = await sb().from("manual_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
