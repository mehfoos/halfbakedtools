// Save the open web page as one self-contained HTML file, from inside the owner's Chrome (sources/README.md,
// "Syncing owner's copies"). An editor runs this through the Claude in Chrome extension's JavaScript tool, after
// setting FILE (the ownerCopy file name). It embeds pictures, stylesheets and fonts as data: URLs, removes scripts
// (the copy is a still snapshot), makes links absolute, records where and when it was saved, computes the SHA-256 of
// the exact bytes and downloads the file. Chrome (university profile) saves downloads into the private folder's
// _inbox, which Google Drive for desktop uploads. Returns a summary; anything that couldn't be embedded is listed.
//
// Usage: open the page in a new tab, then in the JavaScript tool run
//   const FILE = "<prefix>_<name>.html"; const SAVE = true; await <this file's text from "(async" on>
// With SAVE = false it only builds the copy and returns the summary (and window.__hbtSnapshotUrl for a preview).
// Known limits (tested 28 Nov 2026 on an NHS page, 427 KB): fonts or pictures on another server that refuses
// cross-site requests stay as links to the live site (listed in notEmbedded); cookie banners are kept as they were.
(async () => {
  const file = typeof FILE === "string" ? FILE : null;
  if (!file || !/^[\w.-]+\.html$/.test(file)) return { error: "set FILE to a name ending in .html" };
  const save = typeof SAVE === "boolean" ? SAVE : false;
  const failed = new Set();
  const cache = new Map();

  // Load lazy pictures: scroll to the bottom and back, then wait.
  for (let y = 0; y < document.body.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
  scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 800));

  const dataUrl = (url) => {
    if (!url || url.startsWith("data:")) return Promise.resolve(url);
    if (!cache.has(url)) cache.set(url, fetch(url, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then((b) => new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); }))
      .catch(() => { failed.add(url); return url; }));
    return cache.get(url);
  };
  const cssText = async (css, base, depth = 0) => {
    if (depth < 3) for (const m of [...css.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/g)]) {
      const u = new URL(m[1], base).href;
      try { css = css.replace(m[0], await cssText(await (await fetch(u, { credentials: "include" })).text(), u, depth + 1)); }
      catch { failed.add(u); }
    }
    const parts = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
    for (const m of parts) {
      if (m[2].startsWith("data:") || m[2].startsWith("#")) continue;
      const u = new URL(m[2], base).href;
      css = css.split(m[0]).join(`url("${await dataUrl(u)}")`);
    }
    return css;
  };

  const doc = document.documentElement.cloneNode(true);
  const live = [...document.querySelectorAll("img")];
  const copies = [...doc.querySelectorAll("img")];
  // Pictures: use the image the browser actually chose (currentSrc), then drop srcset and lazy-loading markers.
  await Promise.all(copies.map(async (img, i) => {
    const src = live[i]?.currentSrc || live[i]?.src;
    if (src) img.setAttribute("src", await dataUrl(src));
    img.removeAttribute("srcset"); img.removeAttribute("sizes"); img.removeAttribute("loading");
  }));
  doc.querySelectorAll("picture source").forEach((s) => s.remove());
  // Stylesheets: inline linked sheets (with their fonts and pictures), then embed url()s in style blocks and attributes.
  for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"]')]) {
    const href = new URL(link.getAttribute("href"), location.href).href;
    try {
      const style = document.createElement("style");
      style.textContent = await cssText(await (await fetch(href, { credentials: "include" })).text(), href);
      if (link.media) style.media = link.media;
      link.replaceWith(style);
    } catch { failed.add(href); }
  }
  for (const s of doc.querySelectorAll("style")) s.textContent = await cssText(s.textContent, location.href);
  for (const el of doc.querySelectorAll("[style*='url(']")) el.setAttribute("style", await cssText(el.getAttribute("style"), location.href));
  for (const icon of doc.querySelectorAll('link[rel~="icon"]')) icon.setAttribute("href", await dataUrl(new URL(icon.getAttribute("href"), location.href).href));
  // A still copy: no scripts, preloads or frames; links point at the live site.
  doc.querySelectorAll('script, noscript, link[rel~="preload"], link[rel~="prefetch"], link[rel~="modulepreload"]').forEach((e) => e.remove());
  doc.querySelectorAll("iframe").forEach((f) => { const a = document.createElement("a"); a.href = f.src; a.textContent = `[embedded frame: ${f.src}]`; f.replaceWith(a); });
  doc.querySelectorAll("a[href]").forEach((a, i) => { try { a.setAttribute("href", new URL(a.getAttribute("href"), location.href).href); } catch {} });
  const meta = document.createElement("meta");
  meta.name = "hbt-saved-from"; meta.content = `${location.href} | ${new Date().toISOString()}`;
  doc.querySelector("head")?.prepend(meta);

  const html = "<!DOCTYPE html>\n" + doc.outerHTML;
  const bytes = new TextEncoder().encode(html);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const blob = new Blob([bytes], { type: "text/html" });
  window.__hbtSnapshotUrl = URL.createObjectURL(blob);
  if (save) { const a = document.createElement("a"); a.href = window.__hbtSnapshotUrl; a.download = file; document.body.append(a); a.click(); a.remove(); }
  const leftover = (html.match(/(?:src|href)="https?:\/\/[^"]+\.(?:png|jpe?g|gif|svg|webp|css|woff2?)"/g) || []).length;
  return {
    file, saved: save, url: location.href, title: document.title, bytes: bytes.length,
    sha256: hash.match(/.{8}/g).join(" "), // spaced so the tool shows it; remove the spaces when recording it
    pictures: copies.length, notEmbedded: [...failed].slice(0, 20), notEmbeddedCount: failed.size, externalLeft: leftover,
  };
})();
