// The tool's tasks: one focused page each (Merge PDF, Split PDF, ...), all driven by the same workspace code.
// Pure data, so the pages, the home grid and the tests all read the same list.
import type { OutputFormat, SplitMode } from "./session.ts";

/** The home page's categories, in order (the same split ilovepdf.com uses, so people find things where they expect). */
export const GROUPS = ["Organise", "Optimise", "Convert to PDF", "Convert from PDF", "Edit", "Security"] as const;
export type Group = (typeof GROUPS)[number];

/** Toolbar and option groups a task can show. */
export type Part = "select" | "move" | "turn" | "duplicate" | "remove" | "selectText" | "moveTo" | "scale" | "split" | "imageDpi" | "compress" | "marks" | "protect" | "numbers" | "watermark" | "crop" | "sign" | "shapes" | "preview";

export type Task = {
  slug: string;                 // page name: /tools/pdf-tools/<slug>/
  name: string;                 // e.g. "Merge PDF"
  blurb: string;                // one line for the home grid and the page
  group: Group;
  accept: "pdf" | "image" | "both";
  pick: string;                 // text on the big button
  hint: string;                 // what to do once files are added
  parts: Part[];
  formats: OutputFormat[];      // first is the default; more than one shows a chooser
  split?: SplitMode;            // default split mode (only meaningful with the "split" part)
  which: "all" | "selected";    // what the main button saves
  action: string;               // text on the main button
  turnAllIfNoneSelected?: boolean;
  perFile?: boolean;            // each added file is saved as its own PDF (Compress also shows the result before download)
  suffix: string;               // added to the default output name so it differs from the original's ("report-merged")
  tag: string;                  // short label drawn on the task's icon
  selectAll?: boolean;          // pages start out all selected (when the selection only says "which pages this applies to")
};

/** Whether a task needs the page-by-page view. Tasks that act on whole files (Compress, Split, Protect, ...) show a
 *  simple list of files instead, so nobody scrolls past hundreds of pages they have no reason to look at. */
export const showsPages = (t: Task): boolean => t.parts.some((p) => p === "select" || p === "move" || p === "turn" || p === "duplicate" || p === "remove" || p === "marks");

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
  { slug: "rotate", name: "Rotate PDF", blurb: "Turn pages the right way up: all of them, or just the ones you tick.", group: "Edit", accept: "pdf",
    pick: "Select PDF files", hint: "Press a turn button to turn every page, or tick pages first to turn only those.",
    parts: ["select", "turn"], formats: ["pdf"], which: "all", action: "Save PDF", turnAllIfNoneSelected: true, suffix: "rotated", tag: "⟳" , selectAll: true },
  { slug: "resize", name: "Resize pages", blurb: "Make pages larger or smaller, scaling everything on them to match.", group: "Edit", accept: "pdf",
    pick: "Select PDF files", hint: "Type a percentage and press Resize. Tick pages first to resize only those.",
    parts: ["select", "scale"], formats: ["pdf"], which: "all", action: "Save PDF", suffix: "resized", tag: "⤢" , selectAll: true },

  { slug: "edit", name: "Edit PDF", blurb: "Add text, pictures, shapes, highlights and freehand drawing to pages: fill in a form, add a note, a date, a signature picture or a logo.", group: "Edit", accept: "both",
    pick: "Select PDF file", hint: "Press ＋ Text, ＋ Picture, a shape, Highlight or Draw, then drag it into place. This adds to pages; it can't yet change or remove what is already on them.",
    parts: ["marks", "shapes"], formats: ["pdf"], which: "all", action: "Save PDF", suffix: "edited", tag: "✎" },
  { slug: "crop", name: "Crop PDF", blurb: "Trim the margins off pages: drag the edges of the page, or type the margins. Cut-off parts are hidden, not deleted.", group: "Edit", accept: "pdf",
    pick: "Select PDF files", hint: "Drag the edges of the box on the page, or type the margins. Everything outside the box is hidden when the PDF is opened, but is still stored in the file.",
    parts: ["crop"], formats: ["pdf"], which: "all", action: "Crop PDF", perFile: true, suffix: "cropped", tag: "▢" },
  { slug: "page-numbers", name: "Page numbers", blurb: "Add page numbers to a PDF: choose where they go, how they read, and which page they start on.", group: "Edit", accept: "pdf",
    pick: "Select PDF files", hint: "Choose the position and style. The preview shows a page exactly as it will be saved.",
    parts: ["numbers", "preview"], formats: ["pdf"], which: "all", action: "Add page numbers", perFile: true, suffix: "numbered", tag: "1,2" },
  { slug: "watermark", name: "Watermark", blurb: "Put words such as DRAFT or CONFIDENTIAL across every page, as faint or as bold as you like.", group: "Edit", accept: "pdf",
    pick: "Select PDF files", hint: "Type the words and choose how they look. The preview shows a page exactly as it will be saved.",
    parts: ["watermark", "preview"], formats: ["pdf"], which: "all", action: "Add watermark", perFile: true, suffix: "watermarked", tag: "≋" },
  { slug: "compress", name: "Compress PDF", blurb: "Make a PDF smaller by shrinking the pictures inside it. You see the real new size before you download.", group: "Optimise", accept: "pdf",
    pick: "Select PDF files", hint: "Choose how hard to compress, then press Compress to see the new size and a before-and-after preview.",
    parts: ["compress"], formats: ["pdf"], which: "all", action: "Compress PDF", perFile: true, suffix: "compressed", tag: "↓" },

  { slug: "sign", name: "Sign PDF", blurb: "Draw your signature and place it on a page. It is a picture of your handwriting, not a digital signature.", group: "Security", accept: "pdf",
    pick: "Select PDF file", hint: "Press Draw signature, draw it, press Use, then drag it into place and resize it by its corner square. This adds a picture of your handwriting; it is not a cryptographic (digital) signature.",
    parts: ["marks", "sign"], formats: ["pdf"], which: "all", action: "Save signed PDF", suffix: "signed", tag: "✍" },
  { slug: "unlock", name: "Unlock PDF", blurb: "Save a copy of a password-protected PDF that opens without the password. You need to know the password.", group: "Security", accept: "pdf",
    pick: "Select PDF files", hint: "You'll be asked for each file's password when you add it. Only unlock files you have the right to change.",
    parts: [], formats: ["pdf"], which: "all", action: "Unlock PDF", perFile: true, suffix: "unlocked", tag: "🔓" },
  { slug: "protect", name: "Protect PDF", blurb: "Lock a PDF with a password, so it can only be opened by someone who knows it.", group: "Security", accept: "pdf",
    pick: "Select PDF files", hint: "Choose a password. Everyone who opens the saved PDF will have to type it.",
    parts: ["protect"], formats: ["pdf"], which: "all", action: "Protect PDF", perFile: true, suffix: "protected", tag: "🔒" },

  { slug: "pdf-to-jpg", name: "PDF to JPG", blurb: "Save each page of a PDF as a JPEG picture.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Every page is ticked: untick any you don't want. Choose the detail and quality. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["jpeg"], which: "selected", action: "Convert to JPG", suffix: "pages", tag: "JPG" , selectAll: true },
  { slug: "pdf-to-image", name: "PDF to PNG, TIFF, BMP or WebP", blurb: "Save each page of a PDF as a picture in the format you choose.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Every page is ticked: untick any you don't want. Choose the picture format and detail. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["png", "tiff", "bmp", "webp", "jpeg"], which: "selected", action: "Convert to images", suffix: "pages", tag: "PNG" , selectAll: true },
  { slug: "pdf-to-text", name: "PDF to text", blurb: "Pull the words out of a PDF into a plain text file.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Saves the words only, with no layout. Scanned pages are pictures and have no text to save.",
    parts: [], formats: ["txt"], which: "all", action: "Convert to text", suffix: "text", tag: "TXT" , selectAll: true },

  { slug: "image-to-pdf", name: "Images to PDF", blurb: "Turn JPG, PNG, TIFF, BMP, WebP, GIF or SVG pictures into a PDF, one picture per page.", group: "Convert to PDF", accept: "image",
    pick: "Select images", hint: "Drag the pictures into order and turn any that are sideways.",
    parts: ["select", "move", "turn", "remove", "imageDpi"], formats: ["pdf"], which: "all", action: "Convert to PDF", suffix: "images", tag: "IMG" },
];

/** Everything at once, including saving in any format and the settings file. */
export const WORKSPACE: Task = {
  slug: "workspace", name: "All-in-one workspace", blurb: "Every tool on one page, for jobs that need several steps: arrange, then split or convert, and save your settings to carry on later.", group: "Organise", accept: "both",
  pick: "Select PDFs or images", hint: "Tick pages to select them, then use the buttons. Drag pages to reorder them.",
  parts: ["select", "move", "turn", "duplicate", "remove", "selectText", "moveTo", "scale", "split", "imageDpi", "compress", "marks", "shapes", "numbers", "watermark"],
  formats: ["pdf", "png", "jpeg", "webp", "tiff", "bmp", "txt"], which: "all", action: "Save all pages", suffix: "edited", tag: "ALL",
};

/** Planned and not built yet. Shown on the home grid, clearly marked, so nobody hunts for them. Each will only be
 *  added if it can be done entirely on the visitor's device. See ROADMAP.md for the order. */
export const NOT_BUILT: { name: string; tag: string; group: Group }[] = [
  { name: "Repair PDF", tag: "✚", group: "Optimise" },
  { name: "OCR PDF (make scans searchable)", tag: "OCR", group: "Optimise" },
  { name: "Word to PDF", tag: "DOC", group: "Convert to PDF" }, { name: "PowerPoint to PDF", tag: "PPT", group: "Convert to PDF" },
  { name: "Excel to PDF", tag: "XLS", group: "Convert to PDF" }, { name: "HTML file to PDF", tag: "WEB", group: "Convert to PDF" },
  { name: "Text file to PDF", tag: "TXT", group: "Convert to PDF" },
  { name: "PDF to Word", tag: "DOC", group: "Convert from PDF" }, { name: "PDF to PowerPoint", tag: "PPT", group: "Convert from PDF" },
  { name: "PDF to Excel", tag: "XLS", group: "Convert from PDF" }, { name: "PDF to HTML", tag: "WEB", group: "Convert from PDF" },
  { name: "PDF to Markdown", tag: "MD", group: "Convert from PDF" }, { name: "PDF to PDF/A", tag: "A", group: "Convert from PDF" },
  { name: "Fill in PDF forms", tag: "☑", group: "Edit" },
  { name: "Redact PDF (truly remove content)", tag: "▮", group: "Security" },
  { name: "Compare PDF", tag: "⇆", group: "Security" },
];

/** Things other PDF sites offer that can't be done without sending files to a server, so this tool won't offer them. */
export const NOT_POSSIBLE_LOCALLY: { name: string; why: string }[] = [
  { name: "AI summaries and AI translation", why: "the AI models that do this well run on a company's servers" },
  { name: "Scan on a phone and send to this computer", why: "passing a scan between two devices needs a server in the middle; on the phone itself, Images to PDF works with the camera" },
  { name: "Request signatures from other people", why: "it needs a server to pass the document around and keep track" },
  { name: "Web address to PDF", why: "fetching another site's page from here would need a server; a saved HTML file is planned instead" },
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
