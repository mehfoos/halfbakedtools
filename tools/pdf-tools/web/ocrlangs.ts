// Languages offered by OCR PDF. Each is Tesseract's "best" model for that language in integer form (4.0.0_best_int),
// from the @tesseract.js-data/<code> package, copied into this site at build time (tool.json "vendor") and fetched
// from this site only when chosen. Native names are shown so speakers can find their language.
export type OcrLang = { code: string; name: string; native?: string; note?: string; rtl?: boolean };

export const OCR_LANGS: OcrLang[] = [
  { code: "eng", name: "English" },
  { code: "ara", name: "Arabic", native: "العربية", rtl: true },
  { code: "ben", name: "Bengali", native: "বাংলা" },
  { code: "bul", name: "Bulgarian", native: "Български" },
  { code: "chi_sim", name: "Chinese (simplified)", native: "简体中文", note: "horizontal text" },
  { code: "chi_tra", name: "Chinese (traditional)", native: "繁體中文", note: "horizontal text" },
  { code: "ces", name: "Czech", native: "Čeština" },
  { code: "nld", name: "Dutch", native: "Nederlands" },
  { code: "fra", name: "French", native: "Français" },
  { code: "deu", name: "German", native: "Deutsch" },
  { code: "ell", name: "Greek", native: "Ελληνικά" },
  { code: "grc", name: "Greek, ancient" },
  { code: "heb", name: "Hebrew", native: "עברית", rtl: true },
  { code: "hin", name: "Hindi", native: "हिन्दी" },
  { code: "hun", name: "Hungarian", native: "Magyar" },
  { code: "ita", name: "Italian", native: "Italiano" },
  { code: "jpn", name: "Japanese", native: "日本語", note: "horizontal text" },
  { code: "kan", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "kor", name: "Korean", native: "한국어" },
  { code: "kmr", name: "Kurdish (Kurmanji, Latin script)", native: "Kurmancî", note: "Sorani in Arabic script is not available" },
  { code: "lat", name: "Latin", native: "Latina" },
  { code: "mal", name: "Malayalam", native: "മലയാളം" },
  { code: "mar", name: "Marathi", native: "मराठी" },
  { code: "nep", name: "Nepali", native: "नेपाली" },
  { code: "fas", name: "Persian", native: "فارسی", rtl: true },
  { code: "pol", name: "Polish", native: "Polski" },
  { code: "por", name: "Portuguese", native: "Português" },
  { code: "pan", name: "Punjabi (Gurmukhi script)", native: "ਪੰਜਾਬੀ" },
  { code: "ron", name: "Romanian", native: "Română" },
  { code: "rus", name: "Russian", native: "Русский" },
  { code: "slk", name: "Slovak", native: "Slovenčina" },
  { code: "spa", name: "Spanish", native: "Español" },
  { code: "tam", name: "Tamil", native: "தமிழ்" },
  { code: "tel", name: "Telugu", native: "తెలుగు" },
  { code: "tha", name: "Thai", native: "ไทย" },
  { code: "tur", name: "Turkish", native: "Türkçe" },
  { code: "ukr", name: "Ukrainian", native: "Українська" },
  { code: "urd", name: "Urdu", native: "اردو", rtl: true },
  { code: "vie", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "cym", name: "Welsh", native: "Cymraeg" },
];
export const langLabel = (l: OcrLang): string => `${l.name}${l.native ? ` · ${l.native}` : ""}`;
/** The language codes to read with: the main one (English if unknown) plus an optional different second one. */
export function chosenLangs(main: string, also: string): string[] {
  const ok = (c: string) => OCR_LANGS.some((l) => l.code === c), first = ok(main) ? main : "eng";
  return also && ok(also) && also !== first ? [first, also] : [first];
}
