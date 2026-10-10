// Manual trip entries made by the approver on /dashboard.
// POST (batch, from the paste grid) also runs the cross-check: a pending photo with the same day + container
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

/** Body: { by, entries: [{ tripDate, containerNo, driverId?, driverName?, parchiType?, sizeFt?, gatePassNo?, vehicleNo? }] }
 *  (pasted from Excel on /dashboard). Valid rows are inserted; bad ones come back in `errors` by index. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { by?: unknown; entries?: unknown };
  const entered_by = str(b.by);
  const list = Array.isArray(b.entries) ? (b.entries as Record<string, unknown>[]) : [];
  if (!entered_by) return NextResponse.json({ error: "evaluator name required" }, { status: 400 });
  if (!list.length || list.length > 500) return NextResponse.json({ error: "1-500 entries required" }, { status: 400 });

  const errors: { index: number; error: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  const idx: number[] = []; // rows[i] came from list[idx[i]]
  list.forEach((e, i) => {
    const trip_date = str(e.tripDate, 10);
    const container_no = str(e.containerNo, 20).toUpperCase();
    if (!DAY.test(trip_date)) return errors.push({ index: i, error: "valid date required" });
    if (!containerKey(container_no)) return errors.push({ index: i, error: "container number required" });
    const sizeFt = e.sizeFt === 20 || e.sizeFt === 40 ? (e.sizeFt as 20 | 40) : null;
    const parchi_type = str(e.parchiType, 40).toUpperCase();
    const rev = revenueForSize(parchi_type, sizeFt);
    idx.push(i);
    rows.push({
      trip_date,
      driver_id: str(e.driverId) || null,
      driver_name: str(e.driverName) || null,
      container_no,
      container_key: containerKey(container_no),
      size_ft: sizeFt,
      parchi_type: parchi_type || null,
      cycle: parchi_type.split(" ")[1] || null,
      gate_pass_no: str(e.gatePassNo, 30) || null,
      vehicle_no: str(e.vehicleNo, 30) || null,
      revenue: rev.revenue,
      revenue_eligible: rev.eligible,
      entered_by,
    });
  });
  if (!rows.length) return NextResponse.json({ entries: [], errors });

  const client = sb();
  const { data, error } = await client.from("manual_entries").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // cross-check each row — auto-approve a matching pending photo from that day.
  // Sequential on purpose: two rows with the same container must claim two different photos.
  const entries = [];
  for (const d of data ?? []) {
    const matchedPhotoId = await matchEntryToPhoto(client, d as { id: string; trip_date: string; container_key: string; entered_by: string });
    entries.push({ ...d, matched_photo_id: matchedPhotoId ?? null });
  }
  return NextResponse.json({ entries, errors, savedIndexes: idx });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // a matched entry's photo stays approved — undo it from the Approvals tab if that's wrong
  const { error } = await sb().from("manual_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
