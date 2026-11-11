// The tool registry: every tools/<slug>/tool.json (folders starting with "_" are templates).
export type ToolPage = { page: string; label: string };
export type Tool = {
  slug: string; name: string; summary: string; topic: string;
  status: "alpha" | "beta" | "stable"; added: string; pages: ToolPage[];
};

const found = import.meta.glob<Tool>("../../../tools/*/tool.json", { eager: true, import: "default" });

export const TOOLS: Tool[] = Object.entries(found)
  .filter(([path]) => !path.split("/").at(-2)!.startsWith("_"))
  .map(([, t]) => t)
  .sort((a, b) => a.name.localeCompare(b.name));

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
