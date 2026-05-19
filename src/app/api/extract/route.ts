import { NextResponse } from "next/server";
import mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export const runtime = "nodejs";

const MAX_FILE_SIZE_MB = 10;

function tidyText(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/-\n/g, "")
    .trim();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large. Max 10 MB." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const name = file.name.toLowerCase();
  const type = file.type;

  let text = "";

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
    }
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
    });
    const doc = await loadingTask.promise;
    let combined = "";
    for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex += 1) {
      const page = await doc.getPage(pageIndex);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      combined += `${pageText}\n\n`;
    }
    text = combined;
  } else if (
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    text = parsed.value;
  } else if (
    type === "text/plain" ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  ) {
    text = buffer.toString("utf-8");
  } else if (name.endsWith(".doc")) {
    return NextResponse.json(
      { error: "DOC files are not supported. Please upload DOCX." },
      { status: 400 }
    );
  } else {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    title: file.name.replace(/\.[^/.]+$/, ""),
    text: tidyText(text),
  });
}
