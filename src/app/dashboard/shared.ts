// Shared bits for /dashboard (Overview + Approvals tabs).

export type Approval = "pending" | "approved" | "rejected";

export interface Row {
  id: string; driver_id: string; driver_name: string; captured_at: string;
  parchi_type: string | null; container_no: string | null; container_valid: boolean | null;
  iso_code: string | null; size_ft: number | null; gate_pass_no: string | null; cycle: string | null;
  doc_datetime: string | null; vehicle_no: string | null; seal_no: string | null; transporter: string | null;
  revenue: number | null; revenue_eligible: boolean | null; ocr_at: string | null;
  approval_status: Approval; approved_by: string | null; approved_at: string | null; url: string | null;
}

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
