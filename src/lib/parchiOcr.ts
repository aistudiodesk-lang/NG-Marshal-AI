// Parchi OCR field parser — engine-independent. Takes raw OCR text (from Tesseract
// today, could be a vision API tomorrow) and pulls the fields we reconcile on.
// Built and tested against REAL Tesseract output from an Adani "Gate In Pass" receipt.
//
// The Adani parchi is machine-printed as `Label : Value` lines; phone photos add
// perspective + a stamp that garbles a few lines. We anchor on the high-value fields
// (container no, cycle, type, date, vehicle, seal) and validate the container number
// with its ISO 6346 check digit so OCR digit-misreads are caught.

export interface ParsedParchi {
  parchiType?: string;      // e.g. "GATE IN · IMPORT"
  containerNo?: string;     // ISO 6346, e.g. MSBU1635755
  containerValid: boolean;  // check-digit passed
  gatePassNo?: string;
  cycle?: "IMPORT" | "EXPORT";
  docDatetime?: string;     // "15/08/2026 10:24"
  vehicleNo?: string;
  sealNo?: string;
  transporter?: string;
  isParchi: boolean;        // heuristic: looks like a real Adani parchi at all
}

// ── ISO 6346 container check digit ──────────────────────────────────────────────
// Letters map to 10..38 skipping every multiple of 11; first 10 chars weighted by 2^i;
// sum mod 11 (a result of 10 wraps to 0) must equal the trailing check digit.
function letterValue(ch: string): number {
  const A = ch.charCodeAt(0) - 65; // A=0
  let v = 10;
  for (let i = 0; i < 26; i++) {
    if (v % 11 === 0) v++; // skip 11, 22, 33
    if (i === A) return v;
    v++;
  }
  return 0;
}

/** Compute the ISO 6346 check digit for an 11-char container (uses first 10 chars). */
export function containerCheckDigit(code: string): number | null {
  const c = code.toUpperCase();
  if (!/^[A-Z]{4}\d{6}/.test(c)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = c[i];
    const val = i < 4 ? letterValue(ch) : Number(ch);
    sum += val * 2 ** i;
  }
  const cd = sum % 11;
  return cd === 10 ? 0 : cd;
}

/** True if `code` is a well-formed ISO 6346 container number with a valid check digit. */
export function isValidContainer(code: string): boolean {
  const c = code.toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(c)) return false;
  const cd = containerCheckDigit(c);
  return cd !== null && cd === Number(c[10]);
}

// ── Field parser ─────────────────────────────────────────────────────────────────
const up = (s: string) => s.toUpperCase();

/** Find the value on the line that carries a label, tolerating OCR noise around the ':'. */
function afterLabel(text: string, labelRe: RegExp): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    if (labelRe.test(line)) {
      // strip the matched label, then the leading separator/quote noise Tesseract adds
      const rest = line.replace(labelRe, "").replace(/^[\s:;'`’"|.\-\[\]()]+/, "").trim();
      if (rest) return rest;
    }
  }
  return undefined;
}

export function parseParchiText(raw: string): ParsedParchi {
  const text = raw || "";
  const U = up(text);

  // container: 4 letters + 7 digits anywhere; prefer a checksum-valid one
  const candidates = (U.match(/[A-Z]{4}\s?\d{7}/g) || []).map((s) => s.replace(/\s/g, ""));
  let containerNo: string | undefined;
  let containerValid = false;
  for (const c of candidates) {
    if (isValidContainer(c)) { containerNo = c; containerValid = true; break; }
  }
  if (!containerNo && candidates.length) containerNo = candidates[0]; // best effort, flagged invalid

  // cycle
  const cycle = /\bEXPORT\b/.test(U) ? "EXPORT" : /\bIMPORT\b/.test(U) ? "IMPORT" : undefined;

  // parchi type — direction + cycle (address always contains "CFS", so don't key on that)
  const dir = /GATE\s*OUT/.test(U) ? "GATE OUT" : /GATE\s*IN/.test(U) ? "GATE IN" : undefined;
  const parchiType = [dir, cycle].filter(Boolean).join(" · ") || undefined;

  // date + time
  const dt = text.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})/);
  const docDatetime = dt ? `${dt[1]} ${dt[2]}` : undefined;

  // vehicle no (Indian plate)
  const veh = U.match(/[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,2}\s?\d{3,4}/);
  const vehicleNo = veh ? veh[0].replace(/\s/g, "") : undefined;

  // gate pass no — digits on the "Pass No" line
  const passLine = afterLabel(U, /GATE\s*I.{0,3}\s*PASS\s*N[O0]/) || afterLabel(U, /PASS\s*N[O0]/);
  const gatePassNo = passLine ? (passLine.match(/\d{4,8}/)?.[0]) : undefined;

  // seal no — 2 letters + 6-9 digits (EU31887903); skip the vehicle and anything
  // that's just a tail of the container number (e.g. "BU1635755" out of MSBU1635755)
  const sealNo = (U.match(/[A-Z]{2}\d{6,9}/g) || []).find(
    (s) => s !== vehicleNo && !(containerNo && containerNo.includes(s))
  );

  // transporter — best effort (often under the stamp)
  let transporter = afterLabel(U, /TRANSP[O0]RTER\s*NAME/);
  if (transporter && !/[A-Z]{3,}/.test(transporter)) transporter = undefined; // garbage guard

  // is this even a parchi? require a couple of Adani-parchi anchors
  const anchors = [/ADANI/, /CONTAINER\s*N[O0]/, /GATE\s*I/, /CYCLE\s*TYPE/, /CFS/].filter((r) => r.test(U)).length;
  const isParchi = anchors >= 2 || containerValid;

  return { parchiType, containerNo, containerValid, gatePassNo, cycle, docDatetime, vehicleNo, sealNo, transporter, isParchi };
}
