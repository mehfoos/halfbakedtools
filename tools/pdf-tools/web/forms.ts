/**
 * Fill in PDF forms: the fillable fields a PDF already has (text boxes, tick boxes, choices). This does not
 * create fields and cannot fill a form that is only a picture of one (a scan, or lines drawn on the page).
 */
import {
  PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFButton, PDFSignature, PDFName, PDFBool, PDFDict,
  PDFOperator, PDFRef, TextAlignment, layoutMultilineText, layoutSinglelineText, drawRectangle, rotateInPlace, adjustDimsForRotation, reduceRotation,
  componentsToColor, degrees, rgb, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath, beginMarkedContent, endMarkedContent,
  type PDFField, type PDFWidgetAnnotation, type Color,
} from "@cantoo/pdf-lib";
import type { Face, DrawTarget, Rgb } from "./face.ts";

export type FieldKind = "text" | "check" | "radio" | "choice" | "list" | "other";
export type FieldInfo = { name: string; kind: FieldKind; value: string | boolean | string[]; options: string[]; multiline: boolean; maxLength?: number; readOnly: boolean; note?: string };
export type Values = Record<string, string | boolean | string[]>;

export function fieldInfo(f: PDFField): FieldInfo {
  const base = { name: f.getName(), readOnly: f.isReadOnly(), options: [] as string[], multiline: false };
  if (f instanceof PDFTextField) return { ...base, kind: "text", value: f.getText() ?? "", multiline: f.isMultiline(), maxLength: f.getMaxLength() };
  if (f instanceof PDFCheckBox) return { ...base, kind: "check", value: f.isChecked() };
  if (f instanceof PDFRadioGroup) return { ...base, kind: "radio", value: f.getSelected() ?? "", options: f.getOptions() };
  if (f instanceof PDFDropdown) return { ...base, kind: "choice", value: f.getSelected()[0] ?? "", options: f.getOptions() };
  if (f instanceof PDFOptionList) return { ...base, kind: "list", value: f.getSelected(), options: f.getOptions() };
  return { ...base, kind: "other", value: "", note: f instanceof PDFSignature ? "A signature field. It is not filled by this tool." : f instanceof PDFButton ? "A button, which does nothing here." : "A kind of field this tool does not fill." };
}

export async function listFields(bytes: Uint8Array, password?: string): Promise<FieldInfo[]> {
  const doc = await PDFDocument.load(bytes, password === undefined ? {} : { password });
  return doc.getForm().getFields().map(fieldInfo);
}

/**
 * The font filled-in text is drawn in. "auto": Helvetica (the PDF library's default for form fields) where it can show the
 * text, else Noto Sans; "noto" or "own": always that face. `faces` makes the face for a document (see build.ts faceSet).
 */
export type FormFont = "auto" | "noto" | "own";
export type FormFonts = { choice: FormFont; faces(doc: PDFDocument): (key: "noto" | "own") => Promise<Face> };

/** Puts `values` into the fields and saves. `problems` names fields that could not be set and why; `changed` counts fields set. */
export async function fillForm(bytes: Uint8Array, password: string | undefined, values: Values, flatten: boolean, fonts?: FormFonts): Promise<{ bytes: Uint8Array; changed: number; problems: string[]; drawn: number }> {
  const doc = await PDFDocument.load(bytes, password === undefined ? {} : { password }), form = doc.getForm(), problems: string[] = [];
  let changed = 0;
  const helvetica = doc.embedStandardFont(StandardFonts.Helvetica), drawable = new Set(helvetica.getCharacterSet());   // the library's default font for fields
  const helvCan = (t: string) => [...t].every((c) => c === "\n" || drawable.has(c.codePointAt(0)!));
  const faceOf = fonts ? fonts.faces(doc) : undefined;
  const choice = fonts?.choice ?? "auto";
  // Which face draws a field's text: undefined means the library's own drawing in Helvetica.
  const faceFor = async (texts: string[]): Promise<Face | undefined | string> => {
    if (choice === "auto" && texts.every(helvCan)) return undefined;
    if (!faceOf) return "contains a character this form's font cannot show";
    const face = await faceOf(choice === "own" ? "own" : "noto"), all = texts.join("\n");
    await face.prepare?.(all);
    const missing = face.missing(all.replace(/\n/g, ""));
    const shown = [...missing.filter((c) => !/\p{M}/u.test(c)), ...missing.filter((c) => /\p{M}/u.test(c))];   // letters before lone vowel signs and marks, which are hard to read on their own
    return missing.length ? `contains ${missing.length === 1 ? "a character" : "characters"} the chosen font cannot show (${shown.slice(0, 5).join(" ")}${missing.length > 5 ? " …" : ""})` : face;
  };
  const ownDrawn = new Map<PDFField, Face>();
  for (const f of form.getFields()) {
    const name = f.getName(); if (!(name in values) || f.isReadOnly()) continue;
    const v = values[name], now = fieldInfo(f);
    if (JSON.stringify(now.value) === JSON.stringify(v)) continue;
    let face: Face | undefined;
    if (f instanceof PDFTextField || f instanceof PDFDropdown || f instanceof PDFOptionList) {
      const r = await faceFor(f instanceof PDFOptionList ? f.getOptions() : [String(v)]);
      if (typeof r === "string") { problems.push(`"${name}": ${r}`); continue; }
      face = r;
    }
    try {
      if (f instanceof PDFTextField) f.setText(String(v) || undefined);
      else if (f instanceof PDFCheckBox) v ? f.check() : f.uncheck();
      else if (f instanceof PDFRadioGroup) v ? f.select(String(v)) : f.clear();
      else if (f instanceof PDFDropdown) v ? f.select(String(v)) : f.clear();
      else if (f instanceof PDFOptionList) { f.clear(); if ((v as string[]).length) f.select(v as string[]); }
      else continue;
      changed++;
      if (face) ownDrawn.set(f, face);
    } catch (e) {
      problems.push(`"${name}": ${/WinAnsi|encode|character/i.test(String(e)) ? "contains a character this form's font cannot show" : "could not be set"}`);
    }
  }
  // Appearances: fields drawn with our faces first, then every other field that needs one, one field at a time so a
  // field the library cannot draw does not stop the rest.
  for (const [f, face] of ownDrawn) {
    try { drawFieldWith(doc, f as PDFTextField | PDFDropdown | PDFOptionList, face); form.markFieldAsClean(f.ref); }
    catch { problems.push(`"${f.getName()}": set, but its text could not be drawn`); }
  }
  for (const f of form.getFields()) {
    if (ownDrawn.has(f) || !f.needsAppearancesUpdate()) continue;
    try { f.defaultUpdateAppearances(helvetica); } catch { problems.push(`"${f.getName()}" may not look filled in every viewer`); }
  }
  // Viewers that see NeedAppearances redraw fields in the form's own font, which lacks the letters drawn here.
  if (ownDrawn.size) form.acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.False);
  if (flatten) form.flatten({ updateFieldAppearances: false });
  return { bytes: await doc.save(), changed, problems, drawn: ownDrawn.size };
}

// ---------- drawing a field's appearance with a face ----------
// The layout is the PDF library's own (its default appearance providers for text fields, drop-downs and list boxes:
// padding, border, background, rotation, font size from the field or fitted, wrapping, alignment), measured with the
// face; only the drawing of the text differs, so these fields look like the ones the library draws.

const tf = /\/([^\0\t\n\f\r ]+)[\0\t\n\f\r ]+(\d*\.\d+|\d+)[\0\t\n\f\r ]+Tf/g;
const colour = /(\d*\.\d+|\d+)[\0\t\n\f\r ]*(\d*\.\d+|\d+)?[\0\t\n\f\r ]*(\d*\.\d+|\d+)?[\0\t\n\f\r ]*(\d*\.\d+|\d+)?[\0\t\n\f\r ]+(g|rg|k)/g;
const lastMatch = (s: string, re: RegExp) => { let m: RegExpExecArray | null = null, x; re.lastIndex = 0; while ((x = re.exec(s))) m = x; return m; };
/** The font size and text colour in a field's or widget's default appearance (DA), as the library reads them. */
function defaults(da: string | undefined): { size?: number; color?: Rgb } {
  const t = lastMatch(da ?? "", tf), c = lastMatch(da ?? "", colour), out: { size?: number; color?: Rgb } = {};
  if (t && isFinite(Number(t[2]))) out.size = Number(t[2]);
  if (c) {
    const n = c.slice(1, 5).map(Number);
    if (c[5] === "g") out.color = { r: n[0], g: n[0], b: n[0] };
    else if (c[5] === "rg") out.color = { r: n[0], g: n[1], b: n[2] };
    else if (c[5] === "k") out.color = { r: (1 - n[0]) * (1 - n[3]), g: (1 - n[1]) * (1 - n[3]), b: (1 - n[2]) * (1 - n[3]) };   // CMYK shown as RGB, the usual simple conversion
  }
  return out;
}
const RTL_FIRST = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/**
 * Multi-line text as the library lays it out (paragraphs split at line breaks, wrapped at the last space that fits,
 * lines aligned as the field says, each line 1.2 times its font height below the one before, an automatic size the
 * largest that fits), with two differences: each line's height is that of the fonts the line uses, as in web browsers
 * (one Arabic line, whose font asks for about 2.1 em, no longer spaces out the English lines), and the automatic size
 * also keeps the last line's descenders inside the box. A right-to-left line in a left-aligned field is set on the right.
 */
function multiline(face: Face, text: string, alignment: TextAlignment, fixed: number | undefined, bounds: { x: number; y: number; width: number; height: number }) {
  const paragraphs = text.replace(/\t/g, "    ").split(/\r\n|\r|\n/);
  // the library's line splitting: the longest start of the text, ending before a space, that is narrower than the box
  const lastSpace = (t: string) => { for (let i = t.length; i > 0; i--) if (/\s/.test(t[i] ?? "")) return i; return 0; };
  const wrap = (p: string, size: number): string[] => {
    const out: string[] = []; let rest: string | undefined = p;
    while (rest !== undefined) {
      let cut: number = rest.length, line: string = rest, next: string | undefined;
      while (cut > 0) {
        line = rest.slice(0, cut);
        if (face.widthOfTextAtSize(line, size) < bounds.width) { next = rest.slice(cut) || undefined; break; }
        cut = lastSpace(line);
      }
      if (cut === 0) { line = rest; next = undefined; }   // no break fits: the line is left too long, as the library does
      out.push(line); rest = next?.trim() || undefined;
    }
    return out;
  };
  const lay = (size: number) => {
    let y = bounds.y + bounds.height, bottom = Infinity;
    const lines = paragraphs.flatMap((p) => wrap(p, size)).map((t) => {
      const full = face.heightAtSize(size, { text: t || " " }), up = face.heightAtSize(size, { text: t || " ", descender: false }), width = face.widthOfTextAtSize(t, size);
      y -= full * 1.2; bottom = y - (full - up);
      const right = alignment === TextAlignment.Right || (alignment === TextAlignment.Left && RTL_FIRST.test(t));
      const x = alignment === TextAlignment.Center ? bounds.x + bounds.width / 2 - width / 2 : right ? bounds.x + bounds.width - width : bounds.x;
      return { text: t, x, y, width, height: up };
    });
    return { lines, size, fits: bottom >= bounds.y };
  };
  if (fixed) return lay(fixed);
  let best = lay(4);
  for (let s = 5; s < 500; s++) { const r = lay(s); if (!r.fits) break; best = r; }
  return best;
}

/** A stand-in for the library's font, for its layout functions: measures with the face; heights are those of the fonts
 *  the field's text uses (the face may have loaded taller fonts for other fields). */
const measurer = (face: Face, text: string) => ({ widthOfTextAtSize: (t: string, s: number) => face.widthOfTextAtSize(t, s), heightAtSize: (s: number, o?: { descender?: boolean }) => face.heightAtSize(s, { ...o, text }), encodeText: () => undefined });

function drawFieldWith(doc: PDFDocument, field: PDFTextField | PDFDropdown | PDFOptionList, face: Face) {
  if (!face.drawInto) throw new Error("this face cannot draw into a field");
  const list = field instanceof PDFOptionList, text = field instanceof PDFTextField ? field.getText() ?? "" : "";
  for (const widget of field.acroField.getWidgets()) {
    const d = { ...defaults(field.acroField.getDefaultAppearance()), ...Object.fromEntries(Object.entries(defaults(widget.getDefaultAppearance())).filter(([, x]) => x !== undefined)) };
    const rect = widget.getRectangle(), mk = widget.getAppearanceCharacteristics(), bw = widget.getBorderStyle()?.getWidth() ?? 0;
    const rotation = reduceRotation(mk?.getRotation()), { width, height } = adjustDimsForRotation(rect, rotation), padding = 1;
    const bounds = { x: bw + padding, y: bw + padding, width: width - (bw + padding) * 2, height: height - (bw + padding) * 2 };
    const shown = list ? field.getOptions().join("\n") : field instanceof PDFTextField ? text : field.getSelected()[0] ?? "";
    const font = measurer(face, shown.replace(/\n/g, " ")) as never, color = d.color ?? { r: 0, g: 0, b: 0 };

    // what to show: a text field's text (its alignment; right-to-left text in a left-aligned field goes to the right),
    // a drop-down's chosen value, or a list box's options with the chosen ones highlighted
    let lines: { text: string; x: number; y: number; width: number; height: number }[], size: number, lineHeight = 0;
    const align = (t: string, a: TextAlignment) => (a === TextAlignment.Left && RTL_FIRST.test(t) ? TextAlignment.Right : a);
    if (list) {
      const opts = field.getOptions(); if (field.isSorted()) opts.sort();
      const r = layoutMultilineText(opts.join("\n"), { alignment: TextAlignment.Left, fontSize: d.size, font, bounds });
      ({ lines, fontSize: size, lineHeight } = r as typeof r & { lineHeight: number });
      for (const l of lines) if (RTL_FIRST.test(l.text)) l.x = bounds.x + bounds.width - l.width;
    } else if (field instanceof PDFTextField && field.isMultiline()) {
      ({ lines, size } = multiline(face, text, field.getAlignment(), d.size, bounds));
    } else {
      const t = field instanceof PDFTextField ? text : field.getSelected()[0] ?? "";
      const a = field instanceof PDFTextField ? field.getAlignment() : TextAlignment.Left;
      const r = layoutSinglelineText(t, { alignment: align(t, a), fontSize: d.size, font, bounds }); lines = [r.line]; size = r.fontSize;
    }
    const fontsUsed = new Map<string, PDFRef>(), states = new Map<string, PDFDict>(), body: PDFOperator[] = [];
    const target: DrawTarget = {
      doc: { context: doc.context },
      node: {
        newFontDictionary: (tag, ref) => { const key = `${tag.replace(/[^A-Za-z0-9-]/g, "")}-${[...fontsUsed.values()].indexOf(ref) >= 0 ? [...fontsUsed.values()].indexOf(ref) : fontsUsed.size}`; fontsUsed.set(key, ref); return PDFName.of(key); },
        newExtGState: (tag, dict) => { const key = `${tag}${states.size}`; states.set(key, dict); return PDFName.of(key); },
      },
      pushOperators: (...ops) => { body.push(...ops); },
    };
    const toColor = (c?: number[]): Color | undefined => componentsToColor(c);
    const blue = rgb(153 / 255, 193 / 255, 218 / 255), selected = list ? field.getSelected() : [];
    const highlights: PDFOperator[] = [];
    if (list) for (const l of lines) if (selected.includes(l.text)) highlights.push(...drawRectangle({ x: bounds.x - padding, y: l.y - (lineHeight - l.height) / 2, width: width - bw, height: l.height + (lineHeight - l.height) / 2, borderWidth: 0, color: blue, borderColor: undefined, rotate: degrees(0), xSkew: degrees(0), ySkew: degrees(0) }));
    for (const l of lines) if (l.text) face.drawInto(target, l.text, { x: l.x, y: l.y, size, color, rotate: 0, opacity: 1 });
    const { x: cx, y: cy, width: cw, height: ch } = bounds;   // the clip, as the library's: inside the border and padding
    const ops: PDFOperator[] = [
      ...rotateInPlace({ ...rect, rotation }),
      pushGraphicsState(),
      ...drawRectangle({ x: bw / 2, y: bw / 2, width: width - bw, height: height - bw, borderWidth: bw, color: toColor(mk?.getBackgroundColor()), borderColor: toColor(mk?.getBorderColor()), rotate: degrees(0), xSkew: degrees(0), ySkew: degrees(0) }),
      ...highlights,
      moveTo(cx, cy), lineTo(cx, cy + ch), lineTo(cx + cw, cy + ch), lineTo(cx + cw, cy), closePath(), clip(), endPath(),
      beginMarkedContent("Tx"), pushGraphicsState(), ...body, popGraphicsState(), endMarkedContent(),
      popGraphicsState(),
    ];
    const resources: Record<string, unknown> = { Font: Object.fromEntries(fontsUsed) };
    if (states.size) resources.ExtGState = Object.fromEntries(states);
    const stream = doc.context.formXObject(ops, { BBox: doc.context.obj([0, 0, rect.width, rect.height]), Matrix: doc.context.obj([1, 0, 0, 1, 0, 0]), Resources: doc.context.obj(resources as never) });
    setNormal(widget, doc.context.register(stream));
  }
}
function setNormal(widget: PDFWidgetAnnotation, ref: PDFRef) { widget.setNormalAppearance(ref); }
