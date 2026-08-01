Always call me "Fuxi".

## About Me

- I have OCD about code. Use the simplest, most idiomatic solution. Do not over-engineer or make decisions on my behalf.
- I don't care about SEO. I care about performance and content quality.

## Working Agreement

- Always have a plan before coding. If I have not provided one, ask for one before editing files.
- Before proposing an Astro architecture or API, consult [Astro's official documentation](https://docs.astro.build/en/guides/). Prefer solutions in this order:
  1. Astro-native or officially recommended
  2. Astro-adjacent with light adjustments
  3. Custom-built from scratch
- Keep behavior highly customizable. Put site-level choices in configuration or component props instead of scattering hard-coded values.
- Extract reusable or self-contained logic into its own file. The existing `Component.astro` plus `component-parts.ts` or client `.ts` pattern is preferred when it fits.
- Add comments only when critical, and write them in English.
- Search is out of scope unless I explicitly bring it back into scope.
- Do not start the dev server. I run it myself at `http://localhost:4444`; you may inspect that running instance for browser verification.
- Do not edit the `src/data/content` submodule unless the task explicitly concerns blog content.

## Project Snapshot

Oheo is a static, bilingual Astro blog framework intended to become a customizable open-source theme.

- Astro 6 with TypeScript strict mode
- Tailwind CSS v4 through `@tailwindcss/vite`
- pnpm and Node.js `>=22.12.0`
- Static output using Astro's default output mode; there is no adapter
- English (`en`) and Chinese (`zh`), with every locale prefixed
- Markdown rendering with Astro, Shiki/Expressive Code, KaTeX, custom rehype transforms, and Sharp
- Small framework-free client scripts for interactions
- PhotoSwipe for Markdown image viewing
- `astro-icon` with the Tabler icon set

`README.md` is still the Astro starter README and is not an architectural source of truth. Prefer this file and the current code/configuration.

## Commands

Run commands from the repository root:

```sh
pnpm install
pnpm build
pnpm preview
pnpm astro -- --help
```

- `pnpm build` is the main repository-wide verification command.
- There are currently no dedicated test, lint, format, or `astro check` scripts.
- Do not run `pnpm dev`; use Fuxi's existing server at `localhost:4500` when browser checks are needed.

## Source Map

```text
astro.config.mjs             Astro, i18n, Tailwind, Markdown, icon, and code-block setup
src/config.ts                Site identity, widths, navigation, and social links
src/content.ts               Content mapping, loading, filtering, aliases, and slugs
src/i18n/ui.ts               Locales, translation keys, and translation helpers
src/data/                    Framework documentation and content data
src/data/content/            Separate blog-data Git submodule
src/pages/[lang]/            Locale-prefixed static routes
src/layouts/                 Document shells
src/components/common/       Site-wide head, header, footer, theme, language, viewer
src/components/home/         Home hero and starfield
src/components/posts/        Post rendering and sorting
src/components/moments/      Moment timeline cards and sorting
src/components/friends/      Friend cards and data type
src/components/utils/        Outline and shared interaction utilities
src/markdown/                Rehype transforms and shared anchor/slug helpers
src/styles/global.css        Tailwind entry point, global imports, theme variables
src/styles/article.css       Markdown typography under `.article`
```

Use the `@/*` alias for imports from `src/*`.

## Configuration

`src/config.ts` is the source of truth for user-facing site choices:

- `author` and `favicon`
- `header_width`, `header_collapse_width`, and `page_width`
- navigation entries as `{ key, href }`
- social entries as `{ name, href, key, icon }`

Navigation and social labels use translation keys from `src/i18n/ui.ts`; do not put localized labels in `src/config.ts`. Icons use `astro-icon` names such as `tabler:mail`. Prefer the installed icon system over adding one-off SVG component files.

Tailwind cannot discover dynamically assembled classes such as `max-w-${value}`. The supported width values are safelisted in `src/styles/global.css` with `@source inline(...)`. If configuration accepts a new dynamic class value, update the safelist or replace the dynamic construction with a statically discoverable mapping.

## Routing And Layouts

Astro i18n is configured with:

```js
locales: ['en', 'zh']
defaultLocale: 'en'
routing: { prefixDefaultLocale: true }
redirects: { '/': '/en/' }
```

All pages live under `src/pages/[lang]/` and declare `getStaticPaths()`. Use Astro's `getRelativeLocaleUrl()` for internal locale-aware links.

- `index.astro` uses `HomeLayout` and `HomePage`; its statistics come from the filtered post and moment collections.
- `about.astro` uses `CommonPage` and the localized `about` single-content entry.
- `posts.astro` renders sorted, collapsible `Article` previews.
- `posts/[...slug].astro` generates one full post page per matched content item and supports nested slugs.
- `moments.astro` renders the sorted diary timeline.
- `friends.astro` renders shared `friends.md` data and content.
- `archives.astro` is currently a placeholder and its nav entry is disabled in `src/config.ts`.

Layout responsibilities:

- `Layout.astro` is the normal document shell: metadata, pre-paint theme setup, header, image viewer, and footer.
- `CommonPage.astro` wraps normal Markdown pages in a width-constrained `.article` container.
- `HomeLayout.astro` is a full-viewport shell for the home experience and intentionally differs from `Layout.astro`.
- `BaseHead.astro` imports `src/styles/global.css`, so global styles are loaded through every full document layout that includes `BaseHead`.

Do not duplicate document-shell behavior inside pages. When changing global head, theme, header/footer, or image-viewer behavior, check both `Layout.astro` and `HomeLayout.astro`.

## i18n

`src/i18n/ui.ts` is the source of truth:

- `languages` defines supported locale codes and names.
- `defaultLang` is `en`.
- `UIKey` is derived from the English dictionary.
- `getT(Astro.currentLocale)` returns `{ lang, t }` for Astro files.
- `useTranslations(lang)` returns the key lookup function.

Add every UI key to both language dictionaries. Keep literal user-facing component text out of `src/config.ts`; store a translation key there and call `t()` at render time.

The content language convention is different from the UI default locale:

- `foo.md` is Chinese content.
- `foo.en.md` is English content.
- There is no cross-language content fallback.
- A plain string source in `CONTENT` is intentionally shared across languages, as with `friends.md`.

The current list/single routes generally generate both locale pages; missing single content is handled by the page. Post detail routes are generated only from content returned for that locale.

`LangSwitch.astro` preserves the current path and swaps the locale prefix. Preserve this behavior for nested post slugs.

## Content System

Blog content is a Git submodule at `src/data/content` (`fux-i/blog-data`, branch `main`). Framework documentation lives alongside it under `src/data/docs`. Keeping both under `src/` lets Astro process Markdown imports and local assets natively.

`src/content.ts` is both configuration and runtime API. Users map content to pages through `CONTENT`:

```ts
type SingleContent = {
  type: "single";
  source: string | Record<Lang, string>;
};

type CollectionContent = {
  type: "collection";
  source: Record<Lang, RegExp>;
};
```

- Use a string for a single Markdown file shared by all locales.
- Use `Record<Lang, string>` for localized single files.
- Use `Record<Lang, RegExp>` for localized collections.
- Collection regexes match paths relative to `src/data`, not absolute filesystem paths. Blog content mappings therefore include the `content/` prefix.

All Markdown is loaded once and eagerly with the literal Vite glob:

```ts
import.meta.glob<MdModule>("/src/data/**/*.md", { eager: true })
```

The glob must remain a string literal because Vite requires it.

Runtime helpers:

- `getSingle(pageKey, lang)` returns the matching Markdown module with normalized frontmatter, or `null`.
- `getCollection(pageKey, lang)` returns `{ slug, frontmatter, Content, headings }[]`.
- Collections exclude entries with `draft: true` or `show: false` before rendering and before home-page counts.
- Frontmatter aliases are page-specific and normalized by `FRONTMATTER_ALIASES`; an explicit canonical field always wins over its aliases.

Slug priority is `frontmatter.slug` followed by the path-derived fallback. The fallback removes the first source directory and all filename suffixes, so `blog/a/b/c.en.md` becomes `a/b/c`. Localized versions of a post should declare the same slug.

Slug fallback logic also exists in `src/markdown/post-slug.ts` because Markdown transforms run separately from `src/content.ts`. Keep these two implementations behaviorally synchronized if slug derivation changes.

## Frontmatter Contracts

Common collection controls:

```yaml
draft: true   # exclude from collections
show: false   # also exclude from collections
slug: path/to/item
```

Posts use:

```yaml
title: Display title
slug: optional/nested/slug
desc: Optional page description
published-at: YYYY-MM-DD or another lexically sortable timestamp
updated-at: Optional timestamp
tags:
  - tag
```

- Post lists sort descending by `published-at`, then ascending by slug.
- `Article.astro` accepts missing title and falls back to the slug.
- Existing imported content is normalized through aliases: `zhihu-title` to `title`, `zhihu-updated-at` to `updated-at`, and `zhihu-created-at`, `zhihu-content-created`, or `content-created` to `published-at`.

Moments use optional `date`. `getMomentDate()` falls back to the first `YYYY-MM-DD` in the slug, then to the whole slug. Moments sort descending by that resolved string.

Friends are read from the shared `friends.md` frontmatter:

```yaml
friends:
  - name: Name
    tag: Category
    url: https://example.com
    motto: Short description
    avatar: https://example.com/avatar.png
```

Keep reusable frontmatter interpretation and sorting in the adjacent `*-parts.ts` file instead of embedding it in a page.

## Markdown Pipeline

`astro.config.mjs` configures the rendering pipeline:

- `remark-math` and `rehype-katex` render math.
- `astro-expressive-code` renders code with light/dark themes and line-number support.
- `rehype-heading-anchors.ts` scopes `h2` through `h6` IDs with the post slug and de-duplicates repeated headings.
- `rehype-footnote-anchors.ts` scopes footnote references and targets with the same post slug.
- `rehype-video-src.ts` rewrites relative local video and source URLs under `/src/data/`, including raw HTML tags.

The scoped anchor scheme is required because the posts page can render multiple full Markdown documents in one DOM. `Outline.astro` and `outline-client.ts` rely on the transformed heading IDs returned in `CollectionItem.headings`; change the Markdown transforms and outline behavior together.

Markdown asset rules:

- Images must use relative paths such as `./img/example.png`. Bare `img/example.png` is treated as a module import by Vite and breaks the build.
- Relative video paths are supported for `mp4`, `webm`, `ogg`, `mov`, and `m4v` by the custom rehype transform.
- Image-only Markdown paragraphs inside `.article` are enhanced into PhotoSwipe galleries. Alt text is used as the accessible label and viewer caption, so preserve meaningful alt text.

## Components And Client Code

Keep Astro responsible for rendering and use small TypeScript/DOM scripts for interaction. There is no client UI framework.

- `Header.astro` owns locale navigation, theme preference, responsive menu behavior, and social links.
- `ThemeScript.astro` must stay in `<head>` before paint to avoid a theme flash.
- Theme state is stored as `light`, `dark`, or system preference and rendered through `data-theme` on `<html>`.
- `ImageViewer.astro` exposes options through data attributes; `image-viewer.ts` owns PhotoSwipe enhancement.
- `Article.astro` emits `article-layout-change` after expand/collapse; the outline client listens for it to recompute geometry.
- `dismissible.ts` centralizes outside-pointer and focus-loss dismissal behavior.
- `Starfield.astro` respects `prefers-reduced-motion`, caps device-pixel ratio work, and reacts to theme/resize changes.

Reusable client initialization must tolerate multiple matching component instances on a page. Follow existing guards such as data flags or `WeakSet` tracking, and avoid global selectors that accidentally couple unrelated instances.

## Styles

- New components use Tailwind CSS v4. When editing an existing component, follow its current Tailwind/local-style split.
- Prefer semantic custom element tags such as `<moment-card>`, `<post-meta>`, `<page-shell>`, and `<friends-grid>` for structural wrappers.
- `src/styles/global.css` is the Tailwind entry point and imports `article.css` and KaTeX CSS.
- Dark mode is the custom Tailwind variant based on `[data-theme="dark"]`, not the default media-query variant.
- Markdown typography is opt-in through `.article`. Add `.no-article` around embedded UI that must not inherit article typography.
- When writing component `<style>` blocks, prefer nested CSS for readability.
- Prefer relative units (`rem`, `em`) for responsive layout. Absolute pixels are acceptable where they represent canvas pixels, hairlines, or other genuinely pixel-based behavior.
- Preserve both light and dark states, responsive breakpoints, keyboard focus visibility, and reduced-motion behavior when touching interactive UI.
- Keep the established card radius restrained (`rounded-lg` or smaller) unless an existing component requires another shape.

## Verification Checklist

After implementation, verify in proportion to the change:

1. Run `pnpm build` for routing, Markdown, TypeScript, and bundling failures.
2. Use Fuxi's running `http://localhost:4500` instance for rendered behavior; do not start another server.
3. Check both `/en/` and `/zh/` for changes to routes, translations, navigation, content, or layout.
4. Check both light and dark themes for visual changes.
5. Check a narrow mobile viewport and a desktop viewport for responsive changes.
6. For Markdown/article changes, check the post list and a nested detail route, headings/outline, footnotes, code, math, images, and videos as applicable.
7. For content mapping changes, confirm hidden/draft filtering, locale matching, stable slugs, and home-page counts.
