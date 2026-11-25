# Fonts

The site's fonts are **Alegreya** (text and headings) and **Alegreya Sans** (forms, tables, notes), by Juan Pablo
del Peral of Huerta Tipográfica, under the SIL Open Font License 1.1. They are served from this site; no font is
loaded from another site (AGENTS.md, principle 4).

The files are the designers' own web fonts, copied unchanged (not subset, converted or edited by us). Licence
texts: `OFL-Alegreya.txt` and `OFL-AlegreyaSans.txt`, as published with each family. Neither declares a Reserved
Font Name.

| File | Used for | Source (path in the designers' repository) | Version | SHA-256 |
|---|---|---|---|---|
| `Alegreya-Regular.woff2` | body text | github.com/huertatipografica/Alegreya, tag v2.008 (commit 254c16b), `fonts/webfonts/` | 2.008 | `df48af9e17d325cbdbe0340e9e7ce3eaf6e70d31749323b7e79f71cc4237de21` |
| `Alegreya-Italic.woff2` | italic text | same | 2.008 | `113874ad4686813249555a974e2e78c5988fd46e3331823d7e9d300744a1ecc6` |
| `Alegreya-Bold.woff2` | headings, bold | same | 2.008 | `5043b0e4261f2947c3a86cd5239cbb6996c28fdc2042dca396eabe18f8a6ba3a` |
| `Alegreya-BoldItalic.woff2` | bold italic | same | 2.008 | `3b0e26f13c757ec02c04b0c55c38f88b2f7c3093424f4a5a7e2fad82cf03177e` |
| `Alegreya-ExtraBold.woff2` | site title | same as Alegreya above | 2.008 | `4665599f3d5efff1d287f3424a7b9f4b7fa2f1f329d7b7c9bbd9faa0f105a42b` |
| `Alegreya-ExtraBoldItalic.woff2` | site title (italic word) | same as Alegreya above | 2.008 | `0de448e06bde0c50863344679dd20e19f4f5346410635ca6416101ba417bf83d` |
| `AlegreyaSC-Bold.woff2` | header tagline | same as Alegreya above | 2.008 | `66936571c1bab48fbb1557f51c36c8fb6e03f02ba60c1d5667c8ce42bb5dac1e` |
| `AlegreyaSans-Regular.woff2` | forms, tables | github.com/huertatipografica/alegreya-sans, commit b19cf06 (the tag v2.008 holds the older 2.007 files), `fonts/webfonts/` | 2.008 | `241822dcf389a77db3f0ad2f675d69983a4a392c31b52600f804a3e94cb57dc0` |
| `AlegreyaSans-Bold.woff2` | bold in forms, tables | same | 2.008 | `88977a9ef66c7930d5eef74a1eda7e28b03af4fbd42d47c72956f76627028190` |
| `AlegreyaSans-Italic.woff2` | italic in forms, tables | same | 2.008 | `7211c6a913cf23adf4ea86e2ce3b20ecfe349747f8dd345c8e8c6108ea4bf576` |

To update: copy the new files from the designers' repository, replace the checksums above, and check the page
layout and that every character the site uses is covered (`npm run build`, then look at the pages).
