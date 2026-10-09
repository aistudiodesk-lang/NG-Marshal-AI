// Cross-check between approver-made manual entries and driver parchi photos.
// A match = same IST day + same container number. On a match the PHOTO is
// auto-approved and the manual entry is marked matched, so the trip counts once.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Container as a comparable key: A-Z0-9 only (OCR/hand entry differ in spaces & dashes). */
export const containerKey = (s?: string | null) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** IST calendar day (YYYY-MM-DD) of a timestamp. */
export const istDayOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const dayStart = (d: string) => `${d}T00:00:00+05:30`;
const dayEnd = (d: string) => `${d}T23:59:59+05:30`;

async function link(sb: SupabaseClient, entryId: string, photoId: string, by: string) {
  const at = new Date().toISOString();
  await sb.from("parchi_photos").update({ approval_status: "approved", approved_by: `auto · ${by}`, approved_at: at }).eq("id", photoId);
  await sb.from("manual_entries").update({ matched_photo_id: photoId, matched_at: at }).eq("id", entryId);
}

/** A manual entry was just added → auto-approve a pending photo for that day+container. */
export async function matchEntryToPhoto(
  sb: SupabaseClient,
  entry: { id: string; trip_date: string; container_key: string; entered_by: string },
): Promise<string | null> {
  const { data } = await sb
    .from("parchi_photos")
    .select("id,container_no,approval_status")
    .gte("captured_at", dayStart(entry.trip_date))
    .lte("captured_at", dayEnd(entry.trip_date))
    .eq("approval_status", "pending");
  const hit = (data ?? []).find((p) => containerKey(p.container_no as string | null) === entry.container_key);
  if (!hit) return null;
  await link(sb, entry.id, hit.id as string, entry.entered_by);
  return hit.id as string;
}

/** A photo was just read by OCR → auto-approve it if an unmatched manual entry covers it. */
export async function matchPhotoToEntry(
  sb: SupabaseClient,
  photo: { id: string; containerNo?: string | null; capturedAt: string },
): Promise<boolean> {
  const key = containerKey(photo.containerNo);
  if (!key) return false;
  const { data } = await sb
    .from("manual_entries")
    .select("id,entered_by")
    .eq("trip_date", istDayOf(photo.capturedAt))
    .eq("container_key", key)
    .is("matched_photo_id", null)
    .limit(1);
  const entry = (data ?? [])[0];
  if (!entry) return false;
  await link(sb, entry.id as string, photo.id, entry.entered_by as string);
  return true;
}
