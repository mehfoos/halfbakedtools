// Site-wide settings. PUBLIC_REPO is set automatically by the GitHub Actions
// build (e.g. "yourname/halfbakedtools"); set it in a .env file for local builds.
const repo = (import.meta.env.PUBLIC_REPO as string | undefined) || "mehfoos/halfbakedtools";

export const site = {
  name: "Half-Baked Tools",
  tagline: "Open-source tools and utilities for everyday questions and tasks. Always a work in progress.",
  repo,
  repoUrl: `https://github.com/${repo}`,
  /** Where archived copies of references are kept (the repository's sources/ folder). */
  /** Where large archived files are kept (the "source-archive" release; registry in sources/archive.json). */
  releaseArchiveUrl: `https://github.com/${repo}/releases/download/source-archive/`,
  issueUrl: (template: string, title: string) =>
    `https://github.com/${repo}/issues/new?template=${template}&title=${encodeURIComponent(title)}`,
};
