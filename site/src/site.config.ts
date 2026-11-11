// Site-wide settings. PUBLIC_REPO is set automatically by the GitHub Actions
// build (e.g. "yourname/halfbakedtools"); set it in a .env file for local builds.
const repo = (import.meta.env.PUBLIC_REPO as string | undefined) || "mehfoos/halfbakedtools";

export const site = {
  name: "Half-Baked Tools",
  tagline: "Open, evolving tools for life's questions, with the evidence shown.",
  repo,
  repoUrl: `https://github.com/${repo}`,
  /** Where archived copies of references are kept (the repository's sources/ folder). */
  archiveUrl: `https://github.com/${repo}/blob/main/sources/`,
  issueUrl: (template: string, title: string) =>
    `https://github.com/${repo}/issues/new?template=${template}&title=${encodeURIComponent(title)}`,
};
