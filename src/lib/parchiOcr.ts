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
  isoCode?: string;         // Size/Type/ISO code, e.g. 2210 / 4510 / 441E
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

// OCR digit/letter look-alikes. A container is ALWAYS 4 letters + 7 digits, so we know
// which half each char belongs to and can coerce the common confusions, then let the
// ISO 6346 check digit confirm the guess (e.g. "MSMUB095631" -> "MSMU8095631" ✓).
const TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "8": "B", "5": "S", "2": "Z", "6": "G", "4": "A" };
const TO_DIGIT: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", B: "8", S: "5", Z: "2", G: "6", A: "4", T: "7" };

/** Try to recover a valid ISO 6346 container number from a noisy OCR token. */
export function coerceContainer(token: string | undefined): string | null {
  const t = (token || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (let i = 0; i + 11 <= t.length; i++) {
    const w = t.slice(i, i + 11);
    const cand =
      w.slice(0, 4).split("").map((c) => TO_LETTER[c] ?? c).join("") +
      w.slice(4).split("").map((c) => TO_DIGIT[c] ?? c).join("");
    if (isValidContainer(cand)) return cand;
  }
  return null;
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
  const lines = U.split(/\r?\n/);

  // container: 4 letters + 7 digits. Try hardest to get a CHECKSUM-VALID one, correcting
  // OCR confusions (8↔B, 0↔O, …) so a misread like "MSMUB095631" recovers to "MSMU8095631".
  let containerNo: string | undefined;
  let containerValid = false;
  // 1) an exact, already-valid one anywhere
  for (const c of (U.match(/[A-Z]{4}\s?\d{7}/g) || []).map((s) => s.replace(/\s/g, ""))) {
    if (isValidContainer(c)) { containerNo = c; containerValid = true; break; }
  }
  // 2) coerce the token on the labelled "Container No" line
  if (!containerNo) {
    const c = coerceContainer(afterLabel(U, /CONTAINER\s*N[O0]/));
    if (c) { containerNo = c; containerValid = true; }
  }
  // 3) coerce any long alphanumeric token, preferring ones that start with letters
  if (!containerNo) {
    const toks = (U.match(/[A-Z0-9]{11,}/g) || []).sort(
      (a, b) => (/^[A-Z]{3}/.test(b) ? 1 : 0) - (/^[A-Z]{3}/.test(a) ? 1 : 0)
    );
    for (const t of toks) { const c = coerceContainer(t); if (c) { containerNo = c; containerValid = true; break; } }
  }
  // 4) last resort: show the raw candidate, flagged invalid for manual review
  if (!containerNo) {
    const c = (U.match(/[A-Z]{4}\s?\d{7}/g) || [])[0];
    if (c) { containerNo = c.replace(/\s/g, ""); containerValid = false; }
  }

  // cycle
  // cycle — tolerate abbreviations ("EXPRT", "IMPRT") seen on terminal tickets
  const cycle = /EXP.?RT|EXPORT/.test(U) ? "EXPORT" : /IMP.?RT|IMPORT/.test(U) ? "IMPORT" : undefined;

  // parchi type — direction + cycle (address always contains "CFS", so don't key on that)
  const dir = /GATE\s*OUT/.test(U) ? "GATE OUT"
    : /GATE\s*IN/.test(U) ? "GATE IN"
    : /DROP.?OFF/.test(U) ? "DROP-OFF"
    : /PICK.?UP/.test(U) ? "PICK-UP"
    : /RECEIVE|SCAN/.test(U) ? "RECEIVE"
    : undefined;
  const parchiType = [dir, cycle].filter(Boolean).join(" · ") || undefined;

  // size/type/ISO code — a 4-char code starting 2 or 4 (2210, 4510, 441E). OCR mangles
  // the label ("ISO" -> "150"), so anchor loosely then grab the [2/4]xxx token on that line.
  const isoLine = lines.find((l) => /(S[I1]ZE|[I1]S[O0]|TYPE|\b150\b)/.test(l) && /\b[24][0-9A-Z]{3}\b/.test(l));
  const isoCode = isoLine?.match(/\b[24][0-9A-Z]{3}\b/)?.[0];

  // date + time — DD/MM/YYYY (Adani) or ISO YYYY-MM-DD (terminal tickets)
  const dt = text.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})/) || text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
  const docDatetime = dt ? `${dt[1]} ${dt[2]}` : undefined;

  // vehicle no (Indian plate)
  const veh = U.match(/[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,2}\s?\d{3,4}/);
  const vehicleNo = veh ? veh[0].replace(/\s/g, "") : undefined;

  // gate pass no — Tesseract mangles the label ("Gate in Pass No" -> "Gate i 355 NO"),
  // so match the line by shape: a "Gate ... No <digits>" line that isn't Mode/Time/Date.
  const passLine =
    lines.find((l) => /(PASS\s*N[O0]|TRANSACT)/.test(l) && /\d{5,7}/.test(l)) ||
    lines.find((l) => /GATE\s*I/.test(l) && /N[O0]\b/.test(l) && /\d{5,7}/.test(l) && !/(MODE|TIME|DATE|\/)/.test(l));
  const passNums = passLine ? passLine.match(/\d{5,7}/g) : null;
  const gatePassNo = passNums ? passNums[passNums.length - 1] : undefined; // value follows the label

  // seal no — 2 letters + 6-9 digits (EU31887903); skip the vehicle and anything
  // that's just a tail of the container number (e.g. "BU1635755" out of MSBU1635755)
  const cDigits = (containerNo || "").replace(/\D/g, "");
  const sealNo = (U.match(/[A-Z]{2}\d{6,9}/g) || []).find((s) => {
    if (s === vehicleNo) return false;
    const sd = s.replace(/\D/g, "");
    if (cDigits && (cDigits.includes(sd) || sd.includes(cDigits))) return false; // tail of container OCR
    return true;
  });

  // transporter — best effort (often under the stamp)
  let transporter = afterLabel(U, /TRANSP[O0]RTER\s*NAME/);
  if (transporter && !/[A-Z]{3,}/.test(transporter)) transporter = undefined; // garbage guard

  // is this even a parchi? require a couple of Adani-parchi anchors
  const anchors = [/ADANI/, /AICTPL/, /CONTAINER\s*N[O0]/, /GATE\s*I/, /CYCLE\s*TYPE|CATEGORY/, /CFS/, /DROP.?OFF/, /TRANSACT/].filter((r) => r.test(U)).length;
  const isParchi = anchors >= 2 || containerValid;

  return { parchiType, containerNo, containerValid, isoCode, gatePassNo, cycle, docDatetime, vehicleNo, sealNo, transporter, isParchi };
}
