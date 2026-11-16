// The tool's tasks: one focused page each (Merge PDF, Split PDF, ...), all driven by the same workspace code.
// Pure data, so the pages, the home grid and the tests all read the same list.
import type { OutputFormat, SplitMode } from "./session.ts";

/** Toolbar and option groups a task can show. */
export type Part = "select" | "move" | "turn" | "duplicate" | "remove" | "selectText" | "moveTo" | "scale" | "split" | "imageDpi" | "compress" | "marks";

export type Task = {
  slug: string;                 // page name: /tools/pdf-tools/<slug>/
  name: string;                 // e.g. "Merge PDF"
  blurb: string;                // one line for the home grid and the page
  group: "Organise" | "Optimise" | "Convert from PDF" | "Convert to PDF";
  accept: "pdf" | "image" | "both";
  pick: string;                 // text on the big button
  hint: string;                 // what to do once files are added
  parts: Part[];
  formats: OutputFormat[];      // first is the default; more than one shows a chooser
  split?: SplitMode;            // default split mode (only meaningful with the "split" part)
  which: "all" | "selected";    // what the main button saves
  action: string;               // text on the main button
  turnAllIfNoneSelected?: boolean;
  perFile?: boolean;            // each added file is saved as its own PDF, and the result is shown before download
  suffix: string;               // added to the default output name so it differs from the original's ("report-merged")
  tag: string;                  // short label drawn on the task's icon
};

export const TASKS: Task[] = [
  { slug: "merge", name: "Merge PDF", blurb: "Join several PDFs, or PDFs and images, into one file, in the order you choose.", group: "Organise", accept: "both",
    pick: "Select PDF files", hint: "Drag the pages into order, or tick pages and use the buttons. Add more files at any time.",
    parts: ["select", "move", "remove"], formats: ["pdf"], which: "all", action: "Merge PDF", suffix: "merged", tag: "＋" },
  { slug: "split", name: "Split PDF", blurb: "Cut a PDF into several files: one per page, every few pages, or at the pages you choose.", group: "Organise", accept: "pdf",
    pick: "Select PDF file", hint: "Choose how to split. The files are saved together as one .zip file.",
    parts: ["split"], formats: ["pdf"], split: "each", which: "all", action: "Split PDF", suffix: "split", tag: "÷" },
  { slug: "extract", name: "Extract pages", blurb: "Pick the pages you want from a PDF and save just those as a new PDF.", group: "Organise", accept: "pdf",
    pick: "Select PDF file", hint: "Tick the pages to keep, or type their numbers.",
    parts: ["select", "selectText"], formats: ["pdf"], which: "selected", action: "Extract pages", suffix: "extracted", tag: "↗" },
  { slug: "remove-pages", name: "Remove pages", blurb: "Delete the pages you don't want from a PDF.", group: "Organise", accept: "pdf",
    pick: "Select PDF file", hint: "Tick the pages to delete and press Remove. Your original file is not changed.",
    parts: ["select", "selectText", "remove"], formats: ["pdf"], which: "all", action: "Save PDF", suffix: "pages-removed", tag: "−" },
  { slug: "organise", name: "Organise PDF", blurb: "Reorder, duplicate, turn and delete pages, across one file or several.", group: "Organise", accept: "both",
    pick: "Select PDF files", hint: "Drag pages into order, or tick pages and use the buttons.",
    parts: ["select", "move", "turn", "duplicate", "remove", "selectText", "moveTo"], formats: ["pdf"], which: "all", action: "Save PDF", suffix: "organised", tag: "⇄" },
  { slug: "rotate", name: "Rotate PDF", blurb: "Turn pages the right way up: all of them, or just the ones you tick.", group: "Organise", accept: "pdf",
    pick: "Select PDF files", hint: "Press a turn button to turn every page, or tick pages first to turn only those.",
    parts: ["select", "turn"], formats: ["pdf"], which: "all", action: "Save PDF", turnAllIfNoneSelected: true, suffix: "rotated", tag: "⟳" },
  { slug: "resize", name: "Resize pages", blurb: "Make pages larger or smaller, scaling everything on them to match.", group: "Organise", accept: "pdf",
    pick: "Select PDF files", hint: "Type a percentage and press Resize. Tick pages first to resize only those.",
    parts: ["select", "scale"], formats: ["pdf"], which: "all", action: "Save PDF", suffix: "resized", tag: "⤢" },

  { slug: "edit", name: "Edit PDF", blurb: "Add text and pictures to pages: fill in a form, add a note, a date, a signature picture or a logo.", group: "Organise", accept: "both",
    pick: "Select PDF file", hint: "Press ＋ Text or ＋ Picture, then drag it into place. This adds to pages; it can't yet change or remove what is already on them.",
    parts: ["marks"], formats: ["pdf"], which: "all", action: "Save PDF", suffix: "edited", tag: "✎" },
  { slug: "compress", name: "Compress PDF", blurb: "Make a PDF smaller by shrinking the pictures inside it. You see the real new size before you download.", group: "Optimise", accept: "pdf",
    pick: "Select PDF files", hint: "Choose how hard to compress, then press Compress to see the new size and a before-and-after preview.",
    parts: ["compress"], formats: ["pdf"], which: "all", action: "Compress PDF", perFile: true, suffix: "compressed", tag: "↓" },

  { slug: "pdf-to-jpg", name: "PDF to JPG", blurb: "Save each page of a PDF as a JPEG picture.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Choose the detail and quality. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["jpeg"], which: "all", action: "Convert to JPG", suffix: "pages", tag: "JPG" },
  { slug: "pdf-to-image", name: "PDF to PNG, TIFF, BMP or WebP", blurb: "Save each page of a PDF as a picture in the format you choose.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Choose the picture format and detail. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["png", "tiff", "bmp", "webp", "jpeg"], which: "all", action: "Convert to images", suffix: "pages", tag: "PNG" },
  { slug: "pdf-to-text", name: "PDF to text", blurb: "Pull the words out of a PDF into a plain text file.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Saves the words only, with no layout. Scanned pages are pictures and have no text to save.",
    parts: ["select"], formats: ["txt"], which: "all", action: "Convert to text", suffix: "text", tag: "TXT" },

  { slug: "image-to-pdf", name: "Images to PDF", blurb: "Turn JPG, PNG, TIFF, BMP, WebP, GIF or SVG pictures into a PDF, one picture per page.", group: "Convert to PDF", accept: "image",
    pick: "Select images", hint: "Drag the pictures into order and turn any that are sideways.",
    parts: ["select", "move", "turn", "remove", "imageDpi"], formats: ["pdf"], which: "all", action: "Convert to PDF", suffix: "images", tag: "IMG" },
];

/** Everything at once, including saving in any format and the settings file. */
export const WORKSPACE: Task = {
  slug: "workspace", name: "All-in-one workspace", blurb: "Every tool on one page, for jobs that need several steps: arrange, then split or convert, and save your settings to carry on later.", group: "Organise", accept: "both",
  pick: "Select PDFs or images", hint: "Tick pages to select them, then use the buttons. Drag pages to reorder them.",
  parts: ["select", "move", "turn", "duplicate", "remove", "selectText", "moveTo", "scale", "split", "imageDpi", "compress", "marks"],
  formats: ["pdf", "png", "jpeg", "webp", "tiff", "bmp", "txt"], which: "all", action: "Save all pages", suffix: "edited", tag: "ALL",
};

/** Asked for by the owner and not built yet. Shown on the home grid, clearly marked, so nobody hunts for them. */
export const NOT_BUILT: { name: string; tag: string }[] = [
  { name: "Remove or change existing text and pictures", tag: "▮" },
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
