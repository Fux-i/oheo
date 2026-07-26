Always call me "Fuxi".

## About Me

- I have OCD about code. Use the simplest, most idiomatic solution. Do not over-engineer or make decisions on my behalf.
- I don't care about SEO. I care about performance and content quality.

## Overview

An Astro-based blog frontend framework. The goal is to become a popular open-source blog theme.

When drafting proposals, always consult [Astro's official documentation](https://docs.astro.build/en/guides/) first. Prefer solutions in this order:

1. Astro-native / officially recommended
2. Astro-adjacent with light adjustments
3. Custom-built from scratch

Everything should be **highly customizable**. Users may want to change almost anything, so prefer configurable options over hard-coded values.

Search is out of scope for now.

Do not start the dev server. I run it myself; you can verify at `localhost:4500`.

## Coding

- Always have a plan before coding. If I haven't given one, ask.
- Extract reusable or self-contained logic into its own file for a clean project structure.
- Add comments only when critical, and write them in English.

## Styles

- Use semantic element tags, e.g. `<divider>`, `<tool-bar>`, `<contacts>`, `<footer>`.
- `src/styles/global.css` is always loaded.
- New components: use **Tailwind CSS v4**. When editing existing components, follow their existing style approach.
- When writing CSS in `<style>` blocks, prefer **nested CSS** for readability.
- Prefer relative units (`rem`, `em`) over absolute ones for responsive layout.

## i18n

```
output: 'static'  // no adapter

astro.config.mjs
├── i18n: { locales:['en','zh'], defaultLocale:'en',
│          routing:{ prefixDefaultLocale: true } }
└── redirects: { '/': '/en/' }

src/
├── i18n/ui.ts              // useTranslations()
├── pages/[lang]/
│   ├── index.astro         // getStaticPaths()
│   ├── about.astro
│   └── ...
├── components/common/
│   ├── Header.astro        // t() + getRelativeLocaleUrl
│   └── LangSwitch.astro
├── layouts/Layout.astro    // <html lang={Astro.currentLocale}>
└── config.ts               // no literal text — use translation keys
```

## Data & Content Mapping

Blog content lives under `src/data/` (will become a git submodule once stable). Users map files/folders to pages via `src/content.ts`.

**File-naming convention for i18n:**

- `foo.md` → Chinese (zh) — Chinese is the default content language
- `foo.en.md` → English (en)
- A page-language combination with no matching file simply isn't generated (no fallback)

**Why `src/data/` (not `data/`):** Putting content inside `src/` lets Astro natively handle Markdown rendering, image optimization (via `sharp`), and syntax highlighting (via `shiki`). No extra deps needed.

**Configuration shape** (`src/content.ts`):

```ts
export const DATA_BASE = "/src/data";

export const CONTENT = {
  [pageKey]: {
    type: "single" | "collection",
    source:
      | string                          // no i18n, shared across languages
      | Record<Lang, string>            // single, per-language path
      | Record<Lang, RegExp>,           // collection, per-language regex match
  },
} as const;
```

**Runtime helpers** (`src/content.ts`):

- `getSingle(pageKey, lang)` → returns one `{ frontmatter, Content }` module or `null`
- `getCollection(pageKey, lang)` → returns array of `{ slug, frontmatter, Content }`, with `draft: true` filtered out

**Implementation details:**

- All files are loaded once via `import.meta.glob("/src/data/**/*.md", { eager: true })`. The glob pattern must be a string literal — Vite restriction.
- Collection matching uses **RegExp** (not glob) for full expressive power, e.g. `/^blog\/.*(?<!\.en)\.md$/` excludes `.en.md` cleanly.
- Slug priority: `frontmatter.slug` > path-derived fallback (strip first segment + all `.xxx` suffixes).
- Different language versions of the same article share the same slug — language switching just swaps the `/{lang}/` prefix.

**Frontmatter conventions:**

```yaml
---
title: required (for display)
slug: optional (fallback: derived from path)
date: recommended (for sorting)
draft: optional (true excludes from build)
desc: optional (for <meta>)
---
```

**Detail-page routing** uses `[...slug].astro` to support nested paths like `algorithm/graph/connectivity`.

**Markdown image paths** must use `./img/...` (relative). Bare `img/...` will be treated as module imports by Vite and break the build.
