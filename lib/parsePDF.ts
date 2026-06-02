"use client";

/**
 * Client-side document text extraction.
 *
 * PDFs are parsed entirely in the browser with pdfjs-dist (no upload, no server
 * round-trip — the resume never leaves the machine until the interview starts).
 * Plain-text / .txt / .md files are read directly.
 */

let workerConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    // Pin the worker to the exact bundled version to avoid API/worker mismatch.
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    workerConfigured = true;
  }
  return pdfjs;
}

export async function parsePdf(file: File): Promise<string> {
  const pdfjs = await loadPdfJs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct lines using the y-position of each text item.
    let line = "";
    let lastY: number | null = null;
    const out: string[] = [];
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out.push(line.trim());
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    if (line.trim()) out.push(line.trim());
    pages.push(out.join("\n"));
  }

  await doc.destroy();
  return normalizeWhitespace(pages.join("\n\n"));
}

async function readTextFile(file: File): Promise<string> {
  return normalizeWhitespace(await file.text());
}

/** Extracts text from a PDF or a plain-text file based on its type/extension. */
export async function extractDocumentText(file: File): Promise<string> {
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return parsePdf(file);
  return readTextFile(file);
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Rough word count for the upload UI. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
