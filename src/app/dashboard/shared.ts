// Shared bits for /dashboard (Overview + Approvals tabs).

export type Approval = "pending" | "approved" | "rejected";

export interface Row {
  id: string; driver_id: string; driver_name: string; captured_at: string;
  parchi_type: string | null; container_no: string | null; container_valid: boolean | null;
  iso_code: string | null; size_ft: number | null; gate_pass_no: string | null; cycle: string | null;
  doc_datetime: string | null; vehicle_no: string | null; seal_no: string | null; transporter: string | null;
  revenue: number | null; revenue_eligible: boolean | null; ocr_at: string | null;
  approval_status: Approval; approved_by: string | null; approved_at: string | null; url: string | null;
  manualId?: string; // set on rows that came from a manual entry (no photo)
}

/** A trip the approver typed in on /dashboard instead of it arriving as a photo. */
export interface ManualEntry {
  id: string; trip_date: string; driver_id: string | null; driver_name: string | null;
  container_no: string; iso_code: string | null; size_ft: number | null; parchi_type: string | null;
  cycle: string | null; gate_pass_no: string | null; vehicle_no: string | null;
  revenue: number | null; revenue_eligible: boolean | null; entered_by: string;
  matched_photo_id: string | null; matched_at: string | null; created_at: string;
}

/** Show an unmatched manual entry as a row in the trip tables. A MATCHED entry is
 *  represented by its (auto-approved) photo instead, so the trip is never counted twice. */
export const manualAsRow = (m: ManualEntry): Row => ({
  id: `m-${m.id}`, manualId: m.id,
  driver_id: m.driver_id ?? "", driver_name: m.driver_name ?? "—",
  captured_at: `${m.trip_date}T00:00:00+05:30`,
  parchi_type: m.parchi_type, container_no: m.container_no, container_valid: null,
  iso_code: m.iso_code, size_ft: m.size_ft, gate_pass_no: m.gate_pass_no, cycle: m.cycle,
  doc_datetime: null, vehicle_no: m.vehicle_no, seal_no: null, transporter: null,
  revenue: m.revenue, revenue_eligible: m.revenue_eligible, ocr_at: null,
  approval_status: "approved", approved_by: m.entered_by, approved_at: m.created_at, url: null,
});

/** IST calendar day of a timestamp, YYYY-MM-DD. */
export const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const istDT = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
export const istTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
export const dayLabel = (d: string) => new Date(d + "T00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
export const cycleOf = (r: Row) => { const c = (r.cycle || r.parchi_type || "").toUpperCase(); return c.includes("IMP") ? "IMPORT" : c.includes("EXP") ? "EXPORT" : ""; };

/** Inclusive list of YYYY-MM-DD days from `from` to `to`. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (const d = new Date(from + "T00:00"); d <= new Date(to + "T00:00"); d.setDate(d.getDate() + 1)) out.push(d.toLocaleDateString("en-CA"));
  return out;
}

// Status colours — validated (dataviz validator, light surface). Always paired with an icon + number.
export const STATUS = {
  approved: { icon: "✅", label: "Approved", fill: "#1E9E5A", tint: "#DDF3E6", ink: "#12703E" },
  pending:  { icon: "⏳", label: "Pending",  fill: "#E0A100", tint: "#FFF1CC", ink: "#8A5A00" },
  rejected: { icon: "❌", label: "Rejected", fill: "#D64545", tint: "#FBE1E1", ink: "#A12B2B" },
} as const;
