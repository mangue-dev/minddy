import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const PREVIEW_HEADERS = {
  "Content-Security-Policy": [
    "sandbox",
    "default-src 'none'",
    "img-src data: blob:",
    "media-src data: blob:",
    "style-src 'unsafe-inline'",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; "),
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
};

function disposition(download: boolean, fileName: string): string {
  return download
    ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    : "inline";
}

function responseBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function pdfBytes(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length 151 >>\nstream\nBT\n/F1 22 Tf\n72 700 Td\n(Attachment preview) Tj\n/F1 12 Tf\n0 -32 Td\n(This PDF is generated for the temporary public debug gallery.) Tj\n0 -20 Td\n(It contains fake data only.) Tj\nET\nendstream",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(body).byteLength);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(body).byteLength;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

function waveBytes(): Uint8Array {
  const sampleRate = 8_000;
  const durationSeconds = 1.5;
  const samples = Math.round(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.max(0, 1 - index / samples);
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * envelope;
    view.setInt16(44 + index * 2, Math.round(sample * 4_000), true);
  }
  return new Uint8Array(buffer);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";

  if (kind === "image") {
    const bytes = await readFile(
      path.join(process.cwd(), "public/captures/pagesEditor-en-light.webp"),
    );
    return new NextResponse(responseBody(bytes), {
      headers: {
        ...PREVIEW_HEADERS,
        "Content-Type": "image/webp",
        "Content-Disposition": disposition(download, "dashboard-retina-capture.webp"),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  if (kind === "pdf") {
    return new NextResponse(responseBody(pdfBytes()), {
      headers: {
        ...PREVIEW_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition(download, "product-brief.pdf"),
      },
    });
  }

  if (kind === "text") {
    return new NextResponse(
      "Attachment preview debug file\n\nThis document contains fake data only.\nUse it to review typography, spacing, and the sandboxed document surface.\n",
      {
        headers: {
          ...PREVIEW_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": disposition(download, "release-notes.txt"),
        },
      },
    );
  }

  if (kind === "audio") {
    return new NextResponse(responseBody(waveBytes()), {
      headers: {
        ...PREVIEW_HEADERS,
        "Content-Type": "audio/wav",
        "Content-Disposition": disposition(download, "customer-interview.wav"),
      },
    });
  }

  if (kind === "video") {
    return NextResponse.redirect(
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    );
  }

  return new NextResponse("Fake archive contents for the attachment debug gallery.\n", {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": disposition(true, "export-and-supporting-files.zip"),
    },
  });
}
