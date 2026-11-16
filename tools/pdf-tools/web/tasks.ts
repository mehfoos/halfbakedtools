// The tool's tasks: one focused page each (Merge PDF, Split PDF, ...), all driven by the same workspace code.
// Pure data, so the pages, the home grid and the tests all read the same list.
import type { OutputFormat, SplitMode } from "./session.ts";

/** Toolbar and option groups a task can show. */
export type Part = "select" | "move" | "turn" | "duplicate" | "remove" | "selectText" | "moveTo" | "scale" | "split" | "imageDpi";

export type Task = {
  slug: string;                 // page name: /tools/pdf-tools/<slug>/
  name: string;                 // e.g. "Merge PDF"
  blurb: string;                // one line for the home grid and the page
  group: "Organise" | "Convert from PDF" | "Convert to PDF";
  accept: "pdf" | "image" | "both";
  pick: string;                 // text on the big button
  hint: string;                 // what to do once files are added
  parts: Part[];
  formats: OutputFormat[];      // first is the default; more than one shows a chooser
  split?: SplitMode;            // default split mode (only meaningful with the "split" part)
  which: "all" | "selected";    // what the main button saves
  action: string;               // text on the main button
  turnAllIfNoneSelected?: boolean;
  tag: string;                  // short label drawn on the task's icon
};

export const TASKS: Task[] = [
  { slug: "merge", name: "Merge PDF", blurb: "Join several PDFs, or PDFs and images, into one file, in the order you choose.", group: "Organise", accept: "both",
    pick: "Select PDF files", hint: "Drag the pages into order, or tick pages and use the buttons. Add more files at any time.",
    parts: ["select", "move", "remove"], formats: ["pdf"], which: "all", action: "Merge PDF", tag: "＋" },
  { slug: "split", name: "Split PDF", blurb: "Cut a PDF into several files: one per page, every few pages, or at the pages you choose.", group: "Organise", accept: "pdf",
    pick: "Select PDF file", hint: "Choose how to split. The files are saved together as one .zip file.",
    parts: ["split"], formats: ["pdf"], split: "each", which: "all", action: "Split PDF", tag: "÷" },
  { slug: "extract", name: "Extract pages", blurb: "Pick the pages you want from a PDF and save just those as a new PDF.", group: "Organise", accept: "pdf",
    pick: "Select PDF file", hint: "Tick the pages to keep, or type their numbers.",
    parts: ["select", "selectText"], formats: ["pdf"], which: "selected", action: "Extract pages", tag: "↗" },
  { slug: "remove-pages", name: "Remove pages", blurb: "Delete the pages you don't want from a PDF.", group: "Organise", accept: "pdf",
    pick: "Select PDF file", hint: "Tick the pages to delete and press Remove. Your original file is not changed.",
    parts: ["select", "selectText", "remove"], formats: ["pdf"], which: "all", action: "Save PDF", tag: "−" },
  { slug: "organise", name: "Organise PDF", blurb: "Reorder, duplicate, turn and delete pages, across one file or several.", group: "Organise", accept: "both",
    pick: "Select PDF files", hint: "Drag pages into order, or tick pages and use the buttons.",
    parts: ["select", "move", "turn", "duplicate", "remove", "selectText", "moveTo"], formats: ["pdf"], which: "all", action: "Save PDF", tag: "⇄" },
  { slug: "rotate", name: "Rotate PDF", blurb: "Turn pages the right way up: all of them, or just the ones you tick.", group: "Organise", accept: "pdf",
    pick: "Select PDF files", hint: "Press a turn button to turn every page, or tick pages first to turn only those.",
    parts: ["select", "turn"], formats: ["pdf"], which: "all", action: "Save PDF", turnAllIfNoneSelected: true, tag: "⟳" },
  { slug: "resize", name: "Resize pages", blurb: "Make pages larger or smaller, scaling everything on them to match.", group: "Organise", accept: "pdf",
    pick: "Select PDF files", hint: "Type a percentage and press Resize. Tick pages first to resize only those.",
    parts: ["select", "scale"], formats: ["pdf"], which: "all", action: "Save PDF", tag: "⤢" },

  { slug: "pdf-to-jpg", name: "PDF to JPG", blurb: "Save each page of a PDF as a JPEG picture.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Choose the detail and quality. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["jpeg"], which: "all", action: "Convert to JPG", tag: "JPG" },
  { slug: "pdf-to-image", name: "PDF to PNG, TIFF, BMP or WebP", blurb: "Save each page of a PDF as a picture in the format you choose.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Choose the picture format and detail. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["png", "tiff", "bmp", "webp", "jpeg"], which: "all", action: "Convert to images", tag: "PNG" },
  { slug: "pdf-to-text", name: "PDF to text", blurb: "Pull the words out of a PDF into a plain text file.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Saves the words only, with no layout. Scanned pages are pictures and have no text to save.",
    parts: ["select"], formats: ["txt"], which: "all", action: "Convert to text", tag: "TXT" },

  { slug: "image-to-pdf", name: "Images to PDF", blurb: "Turn JPG, PNG, TIFF, BMP, WebP, GIF or SVG pictures into a PDF, one picture per page.", group: "Convert to PDF", accept: "image",
    pick: "Select images", hint: "Drag the pictures into order and turn any that are sideways.",
    parts: ["select", "move", "turn", "remove", "imageDpi"], formats: ["pdf"], which: "all", action: "Convert to PDF", tag: "IMG" },
];

/** Everything at once, including saving in any format and the settings file. */
export const WORKSPACE: Task = {
  slug: "workspace", name: "All-in-one workspace", blurb: "Every tool on one page, for jobs that need several steps: arrange, then split or convert, and save your settings to carry on later.", group: "Organise", accept: "both",
  pick: "Select PDFs or images", hint: "Tick pages to select them, then use the buttons. Drag pages to reorder them.",
  parts: ["select", "move", "turn", "duplicate", "remove", "selectText", "moveTo", "scale", "split", "imageDpi"],
  formats: ["pdf", "png", "jpeg", "webp", "tiff", "bmp", "txt"], which: "all", action: "Save all pages", tag: "ALL",
};

/** Asked for by the owner and not built yet. Shown on the home grid, clearly marked, so nobody hunts for them. */
export const NOT_BUILT: { name: string; tag: string }[] = [
  { name: "Compress PDF", tag: "↓" }, { name: "Edit PDF", tag: "✎" },
  { name: "Word to PDF", tag: "DOC" }, { name: "PowerPoint to PDF", tag: "PPT" }, { name: "Excel to PDF", tag: "XLS" }, { name: "HTML to PDF", tag: "WEB" },
  { name: "PDF to Word", tag: "DOC" }, { name: "PDF to PowerPoint", tag: "PPT" }, { name: "PDF to Excel", tag: "XLS" }, { name: "PDF to HTML", tag: "WEB" },
];

export const ALL_TASKS = [...TASKS, WORKSPACE];
export const taskBySlug = (slug: string): Task => {
  const t = ALL_TASKS.find((x) => x.slug === slug);
  if (!t) throw new Error(`Unknown task: ${slug}`);
  return t;
};
export const ACCEPT: Record<Task["accept"], string> = {
  pdf: ".pdf,application/pdf",
  image: "image/*,.tif,.tiff",
  both: ".pdf,application/pdf,image/*,.tif,.tiff",
};
