// Browser code for the "Show how" animations: only one plays at a time, the one most in view (or the one the
// visitor last pressed Play on), and none plays by itself if the visitor's device asks for reduced motion.
import { ANIMATIONS, phase, PERIOD } from "./animations.ts";
import { viewSvg } from "./figure.ts";

type Item = { el: HTMLElement; anim: (typeof ANIMATIONS)[number]; stopped: boolean; ratio: number; at: number };

let cleanup: (() => void) | undefined;

/** Draw every animation in `root` and start the one in view. Call again after the results are redrawn. */
export function mountAnimations(root: HTMLElement) {
  cleanup?.();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items: Item[] = [...root.querySelectorAll<HTMLElement>("[data-anim]")].map((el) => ({
    el, anim: ANIMATIONS[Number(el.dataset.anim)], stopped: reduce, ratio: 0, at: PERIOD / 2,
  }));
  if (!items.length) { cleanup = undefined; return; }
  let preferred: Item | undefined, active: Item | undefined, raf = 0, last = 0;

  const draw = (it: Item) => {
    const p = it.anim.pose(phase(it.at));
    for (const svg of it.el.querySelectorAll<SVGSVGElement>("svg[data-view]")) svg.innerHTML = viewSvg(p, svg.dataset.view as "side" | "front");
  };
  const open = (it: Item) => !it.el.closest("details:not([open])");
  const label = () => {
    for (const it of items) {
      const b = it.el.parentElement!.querySelector<HTMLButtonElement>("[data-anim-toggle]")!;
      b.textContent = it === active ? "Pause" : "Play";
      b.setAttribute("aria-pressed", String(it === active));
    }
  };
  const choose = () => {
    const candidates = items.filter((it) => !it.stopped && open(it) && it.ratio > 0.3);
    const next = preferred && candidates.includes(preferred) ? preferred : candidates.sort((a, b) => b.ratio - a.ratio)[0];
    if (next !== active) { active = next; last = 0; label(); }
    if (active && !raf) raf = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    raf = 0;
    if (!active) return;
    if (last) active.at += now - last;
    last = now;
    draw(active);
    raf = requestAnimationFrame(tick);
  };

  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) { const it = items.find((x) => x.el === e.target); if (it) it.ratio = e.isIntersecting ? e.intersectionRatio : 0; }
    choose();
  }, { threshold: [0, 0.3, 0.6, 1] });
  const onClick = (ev: Event) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-anim-toggle]");
    if (!b) return;
    const it = items.find((x) => x.el.parentElement === b.closest(".show-how-body"));
    if (!it) return;
    if (it === active) { it.stopped = true; preferred = undefined; }
    else { it.stopped = false; preferred = it; it.ratio = Math.max(it.ratio, 0.31); }
    choose(); label();
  };
  const onToggle = () => choose();
  root.addEventListener("click", onClick);
  root.addEventListener("toggle", onToggle, true);
  for (const it of items) { draw(it); seen.observe(it.el); }
  label();
  cleanup = () => { seen.disconnect(); cancelAnimationFrame(raf); root.removeEventListener("click", onClick); root.removeEventListener("toggle", onToggle, true); };
}
