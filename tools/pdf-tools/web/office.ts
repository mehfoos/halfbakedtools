// "Office to PDF": converts Word, Excel, PowerPoint and OpenDocument files to PDF with LibreOffice, compiled to run
// inside the browser (WebAssembly). The engine is large, so it is only downloaded when the visitor asks for it.
//
// This is the one file in the tool allowed to set up a service worker (public/sw.js); privacy.test.ts checks that.
// The engine's background workers are started from web addresses, which a policy written in the page does not
// bind; the service worker adds the policy to those files as a header instead. So the engine is never started
// unless the service worker is in control and the page is isolated (see `ready` below).
import { WorkerBrowserConverter, createWasmPaths } from "@matbee/libreoffice-converter/browser";
import { safeName } from "./session.ts";
import { CSP } from "./csp.ts";

export const INPUTS = ["docx", "doc", "odt", "rtf", "xlsx", "xls", "ods", "csv", "pptx", "ppt", "odp"];

export function startOffice(root: HTMLElement, base: string, version: string) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const status = $("oStatus");
  const say = (text: string, kind: "info" | "bad" = "info") => { status.hidden = !text; status.textContent = text; status.className = `notice ${kind}`; };
  const sw = navigator.serviceWorker;
  const scope = `${base}tools/pdf-tools/`;
  const ready = () => !!sw?.controller && self.crossOriginIsolated === true;
  let converter: InstanceType<typeof WorkerBrowserConverter> | null = null;
  let busy = false;

  function show() {
    $("oSetup").hidden = ready(); $("oConvert").hidden = !ready();
    if (!sw || typeof DecompressionStream === "undefined" || typeof SharedArrayBuffer === "undefined" && ready()) {
      $<HTMLButtonElement>("oEnable").disabled = true;
      say("This browser can't run the converter. Try a current version of Chrome, Edge or Firefox on a computer.", "bad");
    }
  }

  $("oEnable").addEventListener("click", async () => {
    if (busy || !sw) return;
    busy = true; say("Setting up…");
    try {
      const url = `${scope}sw.js?v=${encodeURIComponent(version)}&csp=${encodeURIComponent(CSP)}`;
      const reg = await sw.register(url, { scope });
      await new Promise<void>((done) => {
        const check = () => { if (reg.active) done(); };
        check(); (reg.installing ?? reg.waiting)?.addEventListener("statechange", check);
        setTimeout(done, 8000);
      });
      location.reload();          // the page must be loaded again, through the service worker, to become isolated
    } catch (e) { console.error(e); busy = false; say("The converter couldn't be set up in this browser (private browsing windows often block it).", "bad"); }
  });

  $("oRemove").addEventListener("click", async () => {
    if (busy) return;
    for (const name of await caches.keys()) if (name.startsWith("pdf-tools-office-engine-")) await caches.delete(name);
    for (const reg of await sw.getRegistrations()) if (reg.scope.endsWith("/tools/pdf-tools/")) await reg.unregister();
    location.reload();
  });

  async function engine() {
    if (!ready()) throw new Error("The converter isn't set up.");
    if (!converter) {
      const vendor = new URL(`${scope}vendor/`, location.href).href;
      const c = new WorkerBrowserConverter({
        ...createWasmPaths(`${vendor}lo/`), browserWorkerJs: `${vendor}lo-worker/browser.worker.global.js`,
        onProgress: (i: { percent?: number; message?: string }) => { if (!results.childElementCount || busy) say(`Starting the converter (the first time, this downloads it)… ${i.message ?? ""}`); },
      });
      await c.initialize();
      converter = c;
    }
    return converter;
  }

  const results = $("oResults");
  const picker = $<HTMLInputElement>("oPicker");
  picker.addEventListener("change", async () => {
    const files = [...(picker.files ?? [])]; picker.value = "";
    if (!files.length || busy) return;
    busy = true; picker.disabled = true;
    try {
      const c = await engine();
      for (const [i, f] of files.entries()) {
        const row = document.createElement("li");
        const ext = (/\.([^.]+)$/.exec(f.name)?.[1] ?? "").toLowerCase();
        if (!INPUTS.includes(ext)) { row.textContent = `${f.name}: not a kind of file this page converts.`; results.append(row); continue; }
        say(`Converting ${f.name} (${i + 1} of ${files.length})…`);
        try {
          const out = await c.convert(new Uint8Array(await f.arrayBuffer()), { outputFormat: "pdf" }, `document.${ext}`);
          const name = `${safeName(f.name.replace(/\.[^.]+$/, ""))}.pdf`;
          const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([out.data as BlobPart], { type: "application/pdf" })), download: name, textContent: `Download ${name}` });
          row.append(a, ` (${Math.max(1, Math.round(out.data.length / 1000))} kB, from ${f.name})`);
        } catch (e) { console.error(e); row.textContent = `${f.name}: couldn't be converted. It may be damaged, password-protected, or use something the converter doesn't support.`; }
        results.append(row);
      }
      say("Done. Check each PDF against the original before relying on it.");
    } catch (e) { console.error(e); say("The converter couldn't start. It needs a lot of memory; closing other tabs may help. Phones and tablets often can't run it.", "bad"); }
    finally { busy = false; picker.disabled = false; }
  });

  show();
}
