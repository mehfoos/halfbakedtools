// Save a file (PDF, spreadsheet, zip, ...) from inside the owner's Chrome under its ownerCopy name, with its SHA-256
// (sources/README.md, "Saving owner's copies"). Open the file's address in a new tab first (so the request is
// same-origin), then in the Claude in Chrome JavaScript tool run
//   const FILE = "<prefix>_<name>.pdf"; await <this file's text from "(async" on>
// Chrome (university profile) saves downloads into the private folder's _inbox, which Google Drive for desktop
// uploads. A web page that came back instead of the file is refused.
(async () => {
  if (typeof FILE !== "string" || !/^[\w.-]+\.\w+$/.test(FILE) || FILE.endsWith(".html")) return { error: "set FILE (not .html)" };
  const r = await fetch(location.href, { credentials: "include" });
  const buf = await r.arrayBuffer();
  const head = new TextDecoder().decode(buf.slice(0, 512)).trimStart().toLowerCase();
  if (!r.ok || head.startsWith("<!doctype html") || head.startsWith("<html")) return { error: `got HTTP ${r.status} or a web page, not the file` };
  if (FILE.endsWith(".pdf") && !head.startsWith("%pdf-")) return { error: "not a PDF" };
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf])); a.download = FILE; document.body.append(a); a.click(); a.remove();
  return { file: FILE, url: location.href, bytes: buf.byteLength, sha256: hash.match(/.{8}/g).join(" ") }; // remove the spaces when recording
})();
