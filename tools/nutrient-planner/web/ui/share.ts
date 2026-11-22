// "Share or save": copy a link, export or import a settings file, and the opt-in "remember on this device".
import { exportFile, forget, importFile, remember } from "../state.ts";
import { cite, type App } from "./app.ts";
import { $, esc, int } from "./dom.ts";

/** `onImport` is called after settings have been loaded from a file. */
export function setupShare(app: App, onImport: () => void) {
  const { root } = app;
  const rememberBox = $<HTMLInputElement>(root, "#rememberBox");

  $(root, "#copyLink").addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(location.href); btn.textContent = "Link copied"; }
    catch { window.prompt("Copy this link:", location.href); }
    setTimeout(() => (btn.textContent = "Copy link"), 2000);
  });
  $(root, "#exportBtn").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(exportFile(app.s));
    a.download = app.kind === "finder" ? "food-finder-settings.json" : "nutrient-planner-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $<HTMLInputElement>(root, "#importFile").addEventListener("change", async (e) => {
    const box = e.target as HTMLInputElement;
    const file = box.files?.[0];
    if (!file) return;
    try { app.load(await importFile(file)); onImport(); }
    catch (err) { alert(err instanceof Error ? err.message : "Couldn't read that file."); }
    box.value = "";
  });
  rememberBox.addEventListener("change", () => { if (rememberBox.checked) remember(app.s, app.kind); else forget(app.kind); });
  $(root, "#forgetBtn").addEventListener("click", () => { forget(app.kind); rememberBox.checked = false; });

  // Where the food data came from, at the foot of the tool.
  const { refreshUrl, methodsUrl } = root.dataset;
  $(root, "#dataInfo").innerHTML = `Food data: ${app.tables.map((t) => `${esc(t.title)} ${t.refs[0] ? cite(t.refs[0]) : ""}, built ${esc(t.generated ?? "on an unknown date")} (${int(t.foods)} foods, ${int(t.basicFoods)} in the Planner)`).join("; ")}; the beta blended option uses USDA and UK CoFID. `
    + (refreshUrl ? `<a href="${esc(refreshUrl)}">Request a data refresh</a>. ` : "")
    + `<a href="${esc(methodsUrl)}">Methods and sources</a>`;
}
