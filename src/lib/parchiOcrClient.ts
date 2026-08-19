"use client";

// Browser-side OCR: runs Tesseract in the browser — on the /parchis office page AND,
// after capture, in the driver app (to work out the revenue). tesseract.js is dynamically
// imported and the worker is created ONCE and reused, so back-to-back captures are fast
// and the ~MBs of WASM/lang data load only when OCR is first needed (never on first paint).
import { parseParchiText, ParsedParchi } from "./parchiOcr";

type Worker = { recognize: (img: Blob | string) => Promise<{ data: { text: string } }> };
let workerP: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  if (!workerP) workerP = import("tesseract.js").then(({ createWorker }) => createWorker("eng") as unknown as Promise<Worker>);
  return workerP;
}

/** Warm up the OCR engine ahead of time (download the WASM/lang data during idle time,
 *  e.g. right after login) so it never competes with a capture's upload later. */
export function preloadOcr(): void {
  void getWorker().catch(() => {});
}

async function ocrBlob(blob: Blob): Promise<{ raw: string; fields: ParsedParchi }> {
  const w = await getWorker();
  const { data } = await w.recognize(blob);
  const raw = data.text || "";
  return { raw, fields: parseParchiText(raw) };
}

/** OCR an image by (signed) URL — used by the office /parchis view. */
export async function ocrImage(url: string) {
  const blob = await (await fetch(url)).blob();
  return ocrBlob(blob);
}

/** OCR a local File/Blob directly — used by the driver app right after capture. */
export async function ocrFile(file: Blob) {
  return ocrBlob(file);
}
