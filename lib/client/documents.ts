"use client";

/**
 * Document text extraction, entirely in the browser — the file is never uploaded.
 */

let configured = false;

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  if (!configured) {
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    configured = true;
  }
  return lib;
}

async function parsePdf(file: File): Promise<string> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const out: string[] = [];
    let line = "";
    let lastY: number | null = null;
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
  await task.destroy();
  return pages.join("\n\n");
}

export async function extractText(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error("That file is over 12 MB.");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (/\.(docx?|pages)$/i.test(file.name)) {
    throw new Error("Word files aren't supported yet — export as PDF or paste the text.");
  }
  const raw = isPdf ? await parsePdf(file) : await file.text();
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (text.length < 40) throw new Error("We couldn't find any text in that file. If it's a scan, paste the text instead.");
  return text;
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
