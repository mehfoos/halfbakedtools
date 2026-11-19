/**
 * Fill in PDF forms: the fillable fields a PDF already has (text boxes, tick boxes, choices). This does not
 * create fields and cannot fill a form that is only a picture of one (a scan, or lines drawn on the page).
 */
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFButton, PDFSignature, type PDFField } from "@cantoo/pdf-lib";

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

/** Puts `values` into the fields and saves. `problems` names fields that could not be set and why; `changed` counts fields set. */
export async function fillForm(bytes: Uint8Array, password: string | undefined, values: Values, flatten: boolean): Promise<{ bytes: Uint8Array; changed: number; problems: string[] }> {
  const doc = await PDFDocument.load(bytes, password === undefined ? {} : { password }), form = doc.getForm(), problems: string[] = [];
  let changed = 0;
  const drawable = new Set(doc.embedStandardFont(StandardFonts.Helvetica).getCharacterSet());   // the font filled-in text is drawn in
  for (const f of form.getFields()) {
    const name = f.getName(); if (!(name in values) || f.isReadOnly()) continue;
    const v = values[name], now = fieldInfo(f);
    if (JSON.stringify(now.value) === JSON.stringify(v)) continue;
    if ((f instanceof PDFTextField || f instanceof PDFDropdown) && typeof v === "string" && [...v].some((c) => c !== "\n" && !drawable.has(c.codePointAt(0)!))) { problems.push(`"${name}": contains a character this form's font cannot show`); continue; }
    try {
      if (f instanceof PDFTextField) f.setText(String(v) || undefined);
      else if (f instanceof PDFCheckBox) v ? f.check() : f.uncheck();
      else if (f instanceof PDFRadioGroup) v ? f.select(String(v)) : f.clear();
      else if (f instanceof PDFDropdown) v ? f.select(String(v)) : f.clear();
      else if (f instanceof PDFOptionList) { f.clear(); if ((v as string[]).length) f.select(v as string[]); }
      else continue;
      changed++;
    } catch (e) {
      problems.push(`"${name}": ${/WinAnsi|encode|character/i.test(String(e)) ? "contains a character this form's font cannot show" : "could not be set"}`);
    }
  }
  try { form.updateFieldAppearances(); } catch { problems.push("some filled fields may not look filled in every viewer"); }
  if (flatten) form.flatten();
  return { bytes: await doc.save(), changed, problems };
}
