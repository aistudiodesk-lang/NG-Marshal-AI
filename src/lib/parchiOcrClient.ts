"use client";

// Browser-side OCR: runs Tesseract in the operator's browser on the /parchis page.
// tesseract.js is dynamically imported so its ~MBs of WASM/lang data only load when
// the operator actually extracts something (never on first paint, never in the driver app).
import { parseParchiText, ParsedParchi } from "./parchiOcr";

export async function ocrImage(url: string): Promise<{ raw: string; fields: ParsedParchi }> {
  const Tesseract = (await import("tesseract.js")).default;
  // Fetch the (signed) image as a blob first — avoids cross-origin canvas-taint issues.
  const blob = await (await fetch(url)).blob();
  const { data } = await Tesseract.recognize(blob, "eng");
  const raw = data.text || "";
  return { raw, fields: parseParchiText(raw) };
}
