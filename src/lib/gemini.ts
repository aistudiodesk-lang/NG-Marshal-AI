// Server-side parchi reader — Google Gemini vision (gemini-3.6-flash). Replaces the old
// browser Tesseract OCR, which returned empty/garbage on real phone photos (rotated, faint
// thermal prints, handwriting). Gemini reads all of it and returns clean structured fields.
// Runs ONLY on the server (Vercel) — the API key never touches the browser/APK, and there is
// NO app rebuild: the driver's WebView just uploads the photo and the server does the reading.

const MODEL = "gemini-3.6-flash";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// Field shape mirrors the old Tesseract parser (src/lib/parchiOcr.ts) so the DB save +
// revenue logic downstream are untouched. parchiType is built from direction + cycle so
// revenue eligibility (GATE-IN only) is driven by reliable fields, not terminal-specific text.
export interface VisionFields {
  parchiType?: string;
  containerNo?: string;
  isoCode?: string;
  gatePassNo?: string;
  cycle?: string;
  docDatetime?: string;
  vehicleNo?: string;
  sealNo?: string;
  transporter?: string;
}

const PROMPT = `You are reading an Indian container terminal gate pass (parchi) — from Adani/AICTPL/ACMTPL or similar. The photo may be rotated, faint thermal print, or handwritten. Read it carefully and return ONLY a compact JSON object (no markdown, no commentary) with these keys:
{"container_no":..., "iso_code":..., "gate_pass_no":..., "cycle":..., "direction":..., "doc_datetime":..., "vehicle_no":..., "seal_no":..., "transporter":...}
Rules:
- container_no: the 11-character ISO 6346 container code (4 letters + 7 digits), e.g. MSMU8095631. Read digits vs letters carefully (0/O, 1/I, 5/S, 8/B).
- iso_code: the 4-char Size/Type/ISO code, e.g. 2210, 4410, 4510. The FIRST digit gives size (2=20ft, 4=40ft).
- gate_pass_no: the gate pass / transaction / pass number (digits).
- cycle: exactly "IMPORT" or "EXPORT" (null if unclear).
- direction: exactly one of "GATE-IN", "GATE-OUT", "DROP-OFF", "PICK-UP", "RECEIVE" (null if unclear).
- doc_datetime: the document date/time as printed.
- vehicle_no / seal_no / transporter: as printed.
Use null for any field not present or unreadable. Return JSON only.`;

interface RawVision {
  container_no?: string | null;
  iso_code?: string | null;
  gate_pass_no?: string | null;
  cycle?: string | null;
  direction?: string | null;
  doc_datetime?: string | null;
  vehicle_no?: string | null;
  seal_no?: string | null;
  transporter?: string | null;
}

const clean = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" ? s : undefined;
};

/** Read one parchi image with Gemini. Returns {fields, raw} (raw = the model's JSON text). */
export async function extractParchiFields(
  imageBase64: string,
  mimeType: string
): Promise<{ fields: VisionFields; raw: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const body = {
    contents: [
      { parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };

  const res = await fetch(ENDPOINT(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!raw) throw new Error("Gemini returned no text");

  let r: RawVision;
  try {
    r = JSON.parse(raw) as RawVision;
  } catch {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const direction = clean(r.direction)?.toUpperCase();
  const cycle = clean(r.cycle)?.toUpperCase();
  // Canonical parchiType e.g. "GATE-IN IMPORT" — revenue eligibility keys off "GATE-IN".
  const parchiType = [direction, cycle].filter(Boolean).join(" ") || undefined;

  return {
    fields: {
      parchiType,
      containerNo: clean(r.container_no)?.toUpperCase(),
      isoCode: clean(r.iso_code)?.toUpperCase(),
      gatePassNo: clean(r.gate_pass_no),
      cycle,
      docDatetime: clean(r.doc_datetime),
      vehicleNo: clean(r.vehicle_no)?.toUpperCase(),
      sealNo: clean(r.seal_no)?.toUpperCase(),
      transporter: clean(r.transporter),
    },
    raw,
  };
}
