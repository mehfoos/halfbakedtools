import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "@cantoo/pdf-lib";
import { markPdfA, infoOf } from "./pdfa.ts";
for (const f of process.argv.slice(2)) {
  const doc = await PDFDocument.load(readFileSync(f), { updateMetadata: false }), now = new Date();
  const i = infoOf(doc);
  markPdfA(doc, { ...i, producer: "Half Baked Tools PDF tools", created: i.created ?? now, modified: now }, crypto.getRandomValues(new Uint8Array(16)));
  writeFileSync(f.replace(/\.pdf$/, ".a.pdf"), await doc.save({ updateFieldAppearances: false }));
}
