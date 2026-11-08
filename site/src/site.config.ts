// Site-wide settings. PUBLIC_REPO is set automatically by the GitHub Actions
// build (e.g. "yourname/halfbakedtools"); set it in a .env file for local builds.
const repo = import.meta.env.PUBLIC_REPO as string | undefined;

export const site = {
  name: "Half-Baked Tools",
  tagline: "Open, evolving tools for life's questions, with the evidence shown.",
  repo,
  repoUrl: repo ? `https://github.com/${repo}` : "https://github.com/",
  refreshIssueUrl: repo
    ? `https://github.com/${repo}/issues/new?template=data-refresh.yml&title=Data+refresh+request`
    : undefined,
};
