// The tool's tasks: one focused page each (Merge PDF, Split PDF, ...), all driven by the same workspace code.
// Pure data, so the pages, the home grid and the tests all read the same list.
import type { OutputFormat, SplitMode } from "./session.ts";

/** The home page's categories, in order (the same split ilovepdf.com uses, so people find things where they expect). */
export const GROUPS = ["Optimise", "Organise", "Convert to PDF", "Convert from PDF", "Edit", "Security"] as const;   // Optimise first: Compress PDF is the most asked-for (owner, 2026-11-22)
export type Group = (typeof GROUPS)[number];

/** Toolbar and option groups a task can show. */
export type Part = "select" | "move" | "turn" | "duplicate" | "remove" | "selectText" | "moveTo" | "scale" | "split" | "imageDpi" | "compress" | "marks" | "protect" | "numbers" | "watermark" | "crop" | "sign" | "shapes" | "imagePage" | "extractPics" | "compare" | "forms" | "ocr" | "preview" | "redact" | "pdfa";

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
export const showsPages = (t: Task): boolean => t.parts.some((p) => p === "select" || p === "move" || p === "turn" || p === "duplicate" || p === "remove" || p === "marks" || p === "redact");

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
  { slug: "compress", name: "Compress PDF", blurb: "Make a PDF smaller, down to a size you choose (such as an upload limit), by shrinking the pictures inside it. You see the real new size before you download.", group: "Optimise", accept: "pdf",
    pick: "Select PDF files", hint: "Type the largest size you want (it starts at about half your file), or choose a level, then press Compress to see the new size and a before-and-after preview.",
    parts: ["compress"], formats: ["pdf"], which: "all", action: "Compress PDF", perFile: true, suffix: "compressed", tag: "↓" },

  { slug: "ocr", name: "OCR PDF", blurb: "Make scanned PDFs searchable: the words in the page pictures are recognised and added as invisible text you can search, select and copy.", group: "Optimise", accept: "pdf",
    pick: "Select PDF files", hint: "Choose the language of the pages (40 are offered). The pages look the same afterwards; recognised text is added on top, invisibly. Recognition takes a few seconds a page and can make mistakes.",
    parts: ["ocr"], formats: ["pdf"], which: "all", action: "Make searchable", perFile: true, suffix: "ocr", tag: "OCR" },
  { slug: "repair", name: "Repair PDF", blurb: "Open a damaged PDF as far as possible and save a clean copy. It fixes damaged structure; it cannot bring back content that is missing.", group: "Optimise", accept: "pdf",
    pick: "Select PDF files", hint: "Each file is opened leniently and every page is checked. The message says what was found and which pages could not be read. Content missing from the file, for example from a cut-off download, cannot be recovered.",
    parts: [], formats: ["pdf"], which: "all", action: "Repair PDF", perFile: true, suffix: "repaired", tag: "✚" },
  { slug: "compare", name: "Compare PDF", blurb: "Put two PDFs side by side and see which words were added or removed, page by page. Text only.", group: "Security", accept: "pdf",
    pick: "Select two PDF files", hint: "Add the original first, then the changed version. Pages are matched by position (page 1 with page 1), and only text is compared, not pictures or drawings.",
    parts: ["compare"], formats: ["pdf"], which: "all", action: "Compare", suffix: "comparison", tag: "⇆" },
  { slug: "text-to-pdf", name: "Text to PDF", blurb: "Turn plain text into a PDF: type or paste it, or open a text file. No formatting, just the words laid out on pages.", group: "Convert to PDF", accept: "pdf",
    pick: "Open a text file", hint: "", parts: [], formats: ["pdf"], which: "all", action: "Save as PDF", suffix: "text", tag: "TXT" },
  { slug: "fill-forms", name: "Fill in PDF forms", blurb: "Type into the fillable fields of a PDF form, tick its boxes, choose from its lists, and save the filled copy.", group: "Edit", accept: "pdf",
    pick: "Select a PDF form", hint: "Works on forms with fillable fields. A form that is only a picture or lines on a page (a scan, for example) has no fields to fill, and the page will say so.",
    parts: ["forms"], formats: ["pdf"], which: "all", action: "Save filled form", suffix: "filled", tag: "☑" },
  { slug: "sign", name: "Sign PDF", blurb: "Draw your signature and place it on a page. It is a picture of your handwriting, not a digital signature.", group: "Security", accept: "pdf",
    pick: "Select PDF file", hint: "Press Draw signature, draw it, press Use, then drag it into place and resize it by its corner square. This adds a picture of your handwriting; it is not a cryptographic (digital) signature.",
    parts: ["marks", "sign"], formats: ["pdf"], which: "all", action: "Save signed PDF", suffix: "signed", tag: "✍" },
  { slug: "unlock", name: "Unlock PDF", blurb: "Save a copy of a password-protected PDF that opens without the password. You need to know the password.", group: "Security", accept: "pdf",
    pick: "Select PDF files", hint: "You'll be asked for each file's password when you add it. Only unlock files you have the right to change.",
    parts: [], formats: ["pdf"], which: "all", action: "Unlock PDF", perFile: true, suffix: "unlocked", tag: "🔓" },
  { slug: "redact", name: "Redact PDF", blurb: "Remove names, numbers and other details for good: mark areas or find words, and those pages are rebuilt without them.", group: "Security", accept: "pdf",
    pick: "Select PDF file", hint: "Find words to remove, or open a page and drag over what to remove. Pages with areas are saved as pictures with the areas painted black, so nothing under them stays in the file.",
    parts: ["redact"], formats: ["pdf"], which: "all", action: "Redact PDF", suffix: "redacted", tag: "▮" },
  { slug: "protect", name: "Protect PDF", blurb: "Lock a PDF with a password, so it can only be opened by someone who knows it.", group: "Security", accept: "pdf",
    pick: "Select PDF files", hint: "Choose a password. Everyone who opens the saved PDF will have to type it.",
    parts: ["protect"], formats: ["pdf"], which: "all", action: "Protect PDF", perFile: true, suffix: "protected", tag: "🔒" },

  { slug: "pdf-to-jpg", name: "PDF to JPG", blurb: "Save each page of a PDF as a JPEG picture.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Every page is ticked: untick any you don't want. Choose the detail and quality. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["jpeg"], which: "selected", action: "Convert to JPG", suffix: "pages", tag: "JPG" , selectAll: true },
  { slug: "pdf-to-image", name: "PDF to PNG, TIFF, BMP or WebP", blurb: "Save each page of a PDF as a picture in the format you choose.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Every page is ticked: untick any you don't want. Choose the picture format and detail. More than one picture is saved as a .zip file.",
    parts: ["select"], formats: ["png", "tiff", "bmp", "webp", "jpeg"], which: "selected", action: "Convert to images", suffix: "pages", tag: "PNG" , selectAll: true },
  { slug: "extract-images", name: "Extract pictures", blurb: "Save the pictures stored inside a PDF as separate files: JPEGs exactly as stored, other pictures as PNG.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "This finds pictures stored in the PDF, not drawings made of lines or text. Several pictures are saved together as one .zip file.",
    parts: ["extractPics"], formats: ["pdf"], which: "all", action: "Extract pictures", suffix: "pictures", tag: "▣" },
  { slug: "pdf-to-word", name: "PDF to Word", blurb: "Turn a PDF's text into a Word document (.docx), with headings, paragraphs and bullet lists guessed from text size and spacing.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "A rough conversion: a PDF stores positioned text, not a document. You get the text to edit, not the look: pictures, tables, columns, fonts, bold and italic are not kept. Scanned pages have no text.",
    parts: [], formats: ["docx"], which: "all", action: "Convert to Word", suffix: "word", tag: "DOC", selectAll: true },
  { slug: "pdf-to-powerpoint", name: "PDF to PowerPoint", blurb: "Turn each page of a PDF into a PowerPoint slide (.pptx) that looks the same.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Each slide holds a picture of its page, so it looks exactly like the PDF but its text can't be edited.",
    parts: [], formats: ["pptx"], which: "all", action: "Convert to PowerPoint", suffix: "slides", tag: "PPT", selectAll: true },
  { slug: "pdf-to-excel", name: "PDF to Excel", blurb: "Put the text of each PDF page into an Excel sheet (.xlsx), in rows and columns guessed from where the words sit, so tables can be worked on.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "A rough conversion that works best for simple tables: columns are guessed from the gaps between words. Merged cells, formulas and formatting are not recovered. Scanned pages have no text.",
    parts: [], formats: ["xlsx"], which: "all", action: "Convert to Excel", suffix: "tables", tag: "XLS", selectAll: true },
  { slug: "pdf-to-pdfa", name: "PDF to PDF/A", blurb: "Make a copy of a PDF for long-term archiving, in the PDF/A-2b standard: fonts embedded, colours defined, no scripts or links to other files.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Each PDF is converted on its own. What was changed, or why a file couldn't be converted, is listed after saving.",
    parts: ["pdfa"], formats: ["pdf"], which: "all", action: "Convert to PDF/A", perFile: true, suffix: "pdfa", tag: "A" },
  { slug: "pdf-to-text", name: "PDF to text", blurb: "Pull the words out of a PDF into a plain text file.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "Saves the words only, with no layout. Scanned pages are pictures and have no text to save.",
    parts: [], formats: ["txt"], which: "all", action: "Convert to text", suffix: "text", tag: "TXT" , selectAll: true },

  { slug: "pdf-to-markdown", name: "PDF to Markdown", blurb: "Turn a PDF's text into a Markdown file, with headings, paragraphs and bullet lists guessed from text size and spacing.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "A rough conversion: a PDF stores positioned text, not structure. Tables, columns, pictures, links, bold and italic are not recovered. Scanned pages have no text.",
    parts: [], formats: ["md"], which: "all", action: "Convert to Markdown", suffix: "markdown", tag: "MD", selectAll: true },
  { slug: "pdf-to-html", name: "PDF to HTML", blurb: "Turn a PDF's text into a simple web page, with headings, paragraphs and bullet lists guessed from text size and spacing.", group: "Convert from PDF", accept: "pdf",
    pick: "Select PDF files", hint: "A rough conversion: a PDF stores positioned text, not structure. Tables, columns, pictures, links, bold and italic are not recovered. Scanned pages have no text.",
    parts: [], formats: ["html"], which: "all", action: "Convert to HTML", suffix: "html", tag: "WEB", selectAll: true },
  { slug: "image-to-pdf", name: "Images to PDF", blurb: "Turn JPG, PNG, TIFF, BMP, WebP, GIF or SVG pictures into a PDF, one picture per page.", group: "Convert to PDF", accept: "image",
    pick: "Select images", hint: "Drag the pictures into order and turn any that are sideways. Under Page, choose a page size and margin.",
    parts: ["select", "move", "turn", "remove", "imageDpi", "imagePage"], formats: ["pdf"], which: "all", action: "Convert to PDF", suffix: "images", tag: "IMG" },
];

/** Everything at once, including saving in any format and the settings file. */
export const WORKSPACE: Task = {
  slug: "workspace", name: "All-in-one workspace", blurb: "Every tool on one page, for jobs that need several steps: arrange, then split or convert, and save your settings to carry on later.", group: "Organise", accept: "both",
  pick: "Select PDFs or images", hint: "Tick pages to select them, then use the buttons. Drag pages to reorder them.",
  parts: ["select", "move", "turn", "duplicate", "remove", "selectText", "moveTo", "scale", "split", "imageDpi", "compress", "marks", "shapes", "imagePage", "numbers", "watermark"],
  formats: ["pdf", "png", "jpeg", "webp", "tiff", "bmp", "txt"], which: "all", action: "Save all pages", suffix: "edited", tag: "ALL",
};

/** Planned and not built yet. Shown on the home grid, clearly marked, so nobody hunts for them. Each will only be
 *  added if it can be done entirely on the visitor's device. See ROADMAP.md for the order. */
export const NOT_BUILT: { name: string; tag: string; group: Group }[] = [
  { name: "Word to PDF", tag: "DOC", group: "Convert to PDF" }, { name: "PowerPoint to PDF", tag: "PPT", group: "Convert to PDF" },
  { name: "Excel to PDF", tag: "XLS", group: "Convert to PDF" }, { name: "HTML file to PDF", tag: "WEB", group: "Convert to PDF" },
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
