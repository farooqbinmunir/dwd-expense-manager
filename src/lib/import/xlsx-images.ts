// Extract images embedded (floating over cells) in an .xlsx export and map each
// one to the cell it is anchored to. Google Sheets exports in-cell images this way.

import { strFromU8, unzipSync } from "fflate";

export interface AnchoredImage {
  row: number; // 1-based sheet row
  col: number; // 0-based column (0 = A)
  cell: string; // e.g. "G31"
  fileName: string; // media file name inside the xlsx
  mimeType: string;
  bytes: Uint8Array;
  /** Set when the anchor cell is the top-left of a merged range, e.g. "G94:G95" */
  mergedRange?: string;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

export function colLetter(col: number): string {
  let s = "";
  let n = col + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function resolvePath(baseFile: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseFile.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function relsFor(file: string): string {
  const parts = file.split("/");
  const name = parts.pop();
  return [...parts, "_rels", `${name}.rels`].join("/");
}

function readRels(files: Record<string, Uint8Array>, file: string): Map<string, string> {
  const map = new Map<string, string>();
  const relsPath = relsFor(file);
  const data = files[relsPath];
  if (!data) return map;
  const xml = strFromU8(data);
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) map.set(id, resolvePath(file, target));
  }
  return map;
}

export function extractAnchoredImages(xlsx: Uint8Array, sheetName: string): AnchoredImage[] {
  const files = unzipSync(xlsx);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const wbRels = readRels(files, "xl/workbook.xml");

  const sheetTag = [...workbook.matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => /\bname="([^"]+)"/.exec(t)?.[1] === sheetName);
  if (!sheetTag) throw new Error(`Sheet "${sheetName}" not found in workbook`);
  const rid = /\br:id="([^"]+)"/.exec(sheetTag)?.[1];
  const sheetPath = rid ? wbRels.get(rid) : undefined;
  if (!sheetPath || !files[sheetPath]) throw new Error(`Sheet file for "${sheetName}" not found`);

  const sheetXml = strFromU8(files[sheetPath]);
  const sheetRels = readRels(files, sheetPath);
  const images: AnchoredImage[] = [];
  const merges = new Map<string, string>();
  for (const mm of sheetXml.matchAll(/<mergeCell[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
    merges.set(mm[1], `${mm[1]}:${mm[2]}`);
  }

  for (const dm of sheetXml.matchAll(/<drawing\b[^>]*r:id="([^"]+)"/g)) {
    const drawingPath = sheetRels.get(dm[1]);
    if (!drawingPath || !files[drawingPath]) continue;
    const drawingXml = strFromU8(files[drawingPath]);
    const drawingRels = readRels(files, drawingPath);

    const anchors = drawingXml.match(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g) ?? [];
    for (const a of anchors) {
      const from = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(a)?.[1];
      const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(a)?.[1];
      if (!from || !embed) continue;
      const col = Number(/<xdr:col>(\d+)<\/xdr:col>/.exec(from)?.[1]);
      const row = Number(/<xdr:row>(\d+)<\/xdr:row>/.exec(from)?.[1]) + 1;
      const mediaPath = drawingRels.get(embed);
      if (!mediaPath || !files[mediaPath]) continue;
      const fileName = mediaPath.split("/").pop()!;
      const ext = fileName.split(".").pop()!.toLowerCase();
      images.push({
        row,
        col,
        cell: `${colLetter(col)}${row}`,
        fileName,
        mimeType: MIME[ext] ?? "application/octet-stream",
        bytes: files[mediaPath],
        mergedRange: merges.get(`${colLetter(col)}${row}`),
      });
    }
  }
  images.sort((x, y) => x.row - y.row || x.col - y.col);
  return images;
}

/** Parse "C29" → { row: 29, col: 2 } */
export function parseCellRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad cell reference ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col: col - 1 };
}

/** Merged ranges of a sheet, e.g. ["A3:A4", "C29:C30"]. */
export function extractMerges(xlsx: Uint8Array, sheetName: string): string[] {
  const files = unzipSync(xlsx);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const wbRels = readRels(files, "xl/workbook.xml");
  const sheetTag = [...workbook.matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => /\bname="([^"]+)"/.exec(t)?.[1] === sheetName);
  const rid = sheetTag ? /\br:id="([^"]+)"/.exec(sheetTag)?.[1] : undefined;
  const sheetPath = rid ? wbRels.get(rid) : undefined;
  if (!sheetPath || !files[sheetPath]) throw new Error(`Sheet "${sheetName}" not found in workbook`);
  const xml = strFromU8(files[sheetPath]);
  return [...xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+\d+:[A-Z]+\d+)"/g)].map((m) => m[1]);
}
