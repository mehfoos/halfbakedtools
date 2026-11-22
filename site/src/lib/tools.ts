// The tool registry: every tools/<slug>/tool.json (folders starting with "_" are templates).
export type ToolPage = { page: string; label: string; nav?: boolean };
export type Tool = {
  slug: string; name: string; summary: string; topic: string;
  /** Short line for the home-page card (the summary is for the meta description and methods pages). */
  tagline: string;
  /** Two or three capital letters drawn on the card's icon square. */
  icon: string;
  /** Position within its topic on the home page (lower first); ties go A to Z. */
  order?: number;
  status: "alpha" | "beta" | "stable"; added: string; pages: ToolPage[];
};

const found = import.meta.glob<Tool>("../../../tools/*/tool.json", { eager: true, import: "default" });

export const TOOLS: Tool[] = Object.entries(found)
  .filter(([path]) => !path.split("/").at(-2)!.startsWith("_"))
  .map(([, t]) => t)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));

/** Topics in the order the home page lists them: health first. Topics not listed here follow, A to Z. */
export const TOPIC_ORDER = ["Health", "Documents"];

export function orderedTopics(tools: Tool[] = TOOLS): string[] {
  const rank = (t: string) => (TOPIC_ORDER.includes(t) ? TOPIC_ORDER.indexOf(t) : TOPIC_ORDER.length);
  return [...new Set(tools.map((t) => t.topic))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export const toolBySlug = (slug: string) => {
  const t = TOOLS.find((x) => x.slug === slug);
  if (!t) throw new Error(`Unknown tool: ${slug}`);
  return t;
};

export const pageHref = (base: string, t: Tool, page: string) =>
  `${base}tools/${t.slug}/${page === "index" ? "" : page + "/"}`;

export const STATUS_LABEL: Record<Tool["status"], string> = {
  alpha: "Early version",
  beta: "Beta",
  stable: "Stable",
};
