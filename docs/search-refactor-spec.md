# Search Refactor Specification

**Status:** Ready for implementation
**Date:** 2026-10-01
**Owner:** Fuxi
**Scope:** Search relevance, result presentation, tag navigation, and responsive layout

## Summary

Refactor the existing static, bilingual search page into a full-width search bar, a date-order toggle, a persistent desktop Tag rail, and a divided results list. Results should show every visible match with semantic highlighting and may show several distinct match snippets from the same document.

The refactor should keep the current Astro + MiniSearch architecture. The reference site uses Pagefind and demonstrates the desired interaction well. Pagefind can support independent records, filters, multilingual indexes, weighted regions, highlighted excerpts, and heading sub-results, but adopting it would be an engine migration alongside the UI refactor. Keeping MiniSearch is the smaller change and preserves Oheo's existing stored-field, typo-fallback, and destination-link contracts while fixing the confirmed relevance defect directly.

Relevance is the first workstream. The current Chinese fuzzy policy makes the sample query `网易` return 31 results even though only four indexed documents contain that literal term. Strict literal or prefix matches must always form a higher-priority tier; fuzzy-only matches may remain available after them when the query has eligible fuzzy terms.

## Investigation Baseline

### Current stack

| Layer | Current implementation |
| --- | --- |
| Site | Astro 6.2.1, static output, locale-prefixed `en` and `zh` routes |
| Styling | Tailwind CSS v4 with the custom `[data-theme]` dark variant |
| Search engine | MiniSearch 7.2.0 in the browser |
| Index build | Custom `astro:build:done` integration scans rendered HTML |
| Index files | `/search-index/en.json` and `/search-index/zh.json` |
| Browser UI | Astro-rendered templates plus framework-free TypeScript DOM code |
| Search state | `?q=`, singular `?tag=`, and optional `?sort=oldest` URL parameters |
| Indexed kinds | Independent Post and Moment documents |
| Indexed fields | Weighted Post `title`, `body`, and `code` fields; Moment body content only, with separate display-only full content |

The important ownership boundaries are already sound:

- `src/search/search-index-integration.ts` extracts searchable rendered HTML and writes the locale indexes.
- `src/search/search-core.ts` owns the shared schema, tokenization, normalization, field weights, and MiniSearch options.
- `src/components/search/SearchPanel.astro` owns rendered controls, templates, and component styles.
- `src/components/search/search-client.ts` owns index loading, URL state, filtering, interaction, and DOM rendering.
- `src/components/posts/search-highlight.ts` highlights terms on a Post detail page after navigation.
- `src/components/posts/Article.astro` and `src/components/moments/MomentCard.astro` emit the build-time search document contract.

### Build snapshot

`pnpm build` passed on 2026-09-30 and produced:

| Locale | Documents | Raw index size |
| --- | ---: | ---: |
| `en` | 41 | about 308 KB |
| `zh` | 80 | about 1.41 MB |

The build still reports existing Markdown/Expressive Code warnings for unsupported code languages and strict KaTeX Unicode input. They are unrelated to this refactor.

Document counts are content-dependent. They are a baseline to report during implementation, not hard-coded release assertions.

### Confirmed relevance defect

For `http://localhost:4444/zh/search/?q=网易`:

1. MiniSearch returns 31 documents.
2. Only four of the first 30 rendered documents contain the exact text `网易`.
3. The first result is the unrelated Post `记一次 NixOS 折腾之旅`, highlighting `网格`.
4. Other approximate results highlight `网站`, `网友`, `网址`, `易`, `网络`, and `容易`.

The cause is the combination of:

- per-character and overlapping-bigram Chinese indexing in `search-core.ts`;
- fuzzy edit distance `1` for every two-to-four-character Han query token;
- global prefix matching; and
- one query token for `网易`, which makes `combineWith: "AND"` ineffective as a precision guard.

The current highlight mapper then selects one nearest returned index term for the query token. It therefore explains the approximate result by highlighting `网格`, but cannot make the result relevant.

### Current UI gaps

| Area | Current | Target |
| --- | --- | --- |
| Search controls | Query input and Tag dropdown share one row | Full-width query bar with date-order toggle above the workspace |
| Tags | Compact popover, counts computed but discarded | Persistent left rail on desktop with visible counts |
| Mobile tags | Full-width popover | Compact disclosure using the same option list |
| Results | Independent bordered cards | Unframed editorial list separated by rules |
| Title matches | Never highlighted | All visible title matches highlighted |
| Snippets | One fixed window around the earliest body-or-code match | Several bounded, de-duplicated match windows |
| Fields | Body always wins over code when both match | Body and code matches can both be represented |
| Result headings | Bare result link | Semantic `h2` title and optional section labels |
| Highlight theme | Search and article marks use different rules | One accessible light/dark highlight treatment |
| Width | Search route hard-codes `max-w-5xl` | Derive page width from `SITE.page_width` |

### Product decisions

The following choices are settled for implementation:

- Keep MiniSearch and the current Astro build-time index integration.
- Show strict literal/prefix matches first, followed by a visibly labeled fuzzy-only tier. A document is strict if all query terms have strict matches somewhere in its searchable fields.
- Keep fuzzy matching enabled alongside strict search, but disallow fuzzy matching for Han runs shorter than the configured minimum (at least three characters). Short-Han-only queries such as `网易` therefore have no fuzzy tier.
- Keep exact, singular Tag selection. Tag counts reflect the union of strict and fuzzy candidates before the active Tag filter; stable Tag order remains corpus frequency then locale collation.
- Add a newest/oldest toggle below the query bar. Newest is default and omitted from the URL; oldest uses `?sort=oldest`.
- Within strict and fuzzy tiers, rank with MiniSearch relevance plus a small bounded recency boost normalized within the post-Tag candidate set. Strict always precedes fuzzy. Oldest-first inverts only the date component. Missing dates remain last.
- Show one result per document with multiple bounded snippets. Titles are highlighted separately and do not consume the snippet limit.
- For Tag-only Post results, show description first, then first non-empty paragraph. For keyword Post results with no body/code match (including title-only matches), use the same fallback. Keep description display-only, not searchable.
- For Moment results, search body only; show complete normalized authored content for Tag-only and keyword matches. Synthetic `Moment · date` labels remain display-only result metadata and do not participate in matching or highlighting.
- Keep date ordering, query, and Tag state shareable through the URL; browser history restores all three.
- Add focused Vitest coverage for pure search helpers; use the existing development server for browser verification.

### Reference findings

The attached design and the live `https://arthals.ink/search` page were inspected on 2026-09-30. The live reference is Astro 6.2.1 and uses Pagefind UI. Its useful patterns are:

- one prominent query input above all filters and results;
- a roughly 1:4 desktop filter/results split;
- a compact Tag rail with counts;
- flat result groups divided by horizontal rules;
- multiple linked section matches within one result;
- semantic `<mark>` elements for every visible occurrence; and
- a compact single-column layout when space is constrained.

The supplied screenshot shows query-relative Tag counts, including zero counts. The live reference currently shows corpus-wide counts. This specification uses query-relative counts because the supplied screenshot is the stated target.

## Architecture Decision

### Recommendation: keep MiniSearch

Retain the current custom index and MiniSearch runtime, and treat the Pagefind site as a UX reference rather than a dependency target.

Reasons:

1. This refactor can correct relevance and presentation without changing the build/runtime boundary or serialized-index format wholesale.
2. Oheo's current contract intentionally separates body and code fields, weights them independently, removes code gutters, and stores heading offsets for Post deep links.
3. The current DOM indexing contract, locale isolation, exact Tag filtering, independent Moment results, configurable typo fallback, and Post destination highlighting are working behavior worth preserving.
4. The requested multi-window body/code snippets and field attribution still need Oheo-specific presentation logic even if Pagefind supplies highlighted excerpts and heading sub-results.
5. Replacing the engine and refactoring the UI simultaneously would increase migration and regression risk while obscuring whether relevance changes came from policy or engine behavior.

This is an incremental-scope decision, not a claim that Pagefind cannot implement the target. Pagefind's Node API can add custom records or virtual HTML for independent Moments; its filters, language indexes, weighting, highlighting, and `sub_results` cover much of the target. A migration would still need a focused prototype for virtual Moment records, body/code attribution, multiple windows within one section, destination highlighting, Chinese relevance semantics, and compressed/on-demand payload cost. Revisit Pagefind after that prototype or when the current index becomes a measured performance bottleneck.

### Astro alignment

The proposed architecture follows Astro's official patterns:

- Keep component HTML in `.astro` and interaction in a processed `<script>` import. Astro bundles TypeScript, de-duplicates the script, and recommends `querySelectorAll()` or custom elements for multiple instances.
- Continue passing server-rendered labels and configuration through `data-*` attributes.
- Keep index generation in `astro:build:done`, the official hook for extending completed static output.
- Continue using `getRelativeLocaleUrl()` for localized internal routes.

No client UI framework is required.

## Goals

1. Strict literal and prefix matches must take precedence over approximate matches.
2. A short Chinese query must not flood the result set with one-edit alternatives.
3. The query bar must span the available page width above filters and results.
4. Tags must be visible beside results on desktop and remain usable on narrow screens.
5. Each visible matching occurrence must be highlighted in the title or snippet where it appears.
6. One result may show multiple distinct match contexts from its title, body, and code.
7. Query and Tag state must remain shareable and restorable through the URL.
8. Existing locale separation, Tag-only search, Post heading links, keyboard behavior, and destination Post highlighting must remain intact.
9. Search behavior that theme users are likely to tune must remain centralized in `SITE.search`.
10. The refactor must not materially regress index payload or input responsiveness.

## Non-Goals

- Replacing MiniSearch with Pagefind or another engine.
- Adding a search modal, command palette, autocomplete, or search suggestions.
- Adding multi-tag selection without an explicit product decision.
- Changing Post or Moment content, frontmatter, slugs, or the `src/data/content` submodule.
- Adding server rendering, an adapter, or a search API.
- Adding result pagination or infinite loading in this refactor.
- Changing Header navigation or the global language-switch contract.
- SEO work.

## Product Decisions

These product decisions have been confirmed and are normative.

| Decision | Settled behavior | Rationale |
| --- | --- | --- |
| Meaning of "multiple appearances" | Multiple distinct occurrence snippets per result, with every visible occurrence highlighted | Matches the supplied reference and closes the current one-snippet limitation |
| Tag selection | Keep one exact Tag at a time | Preserves the existing `?tag=` URL contract and avoids checkbox semantics that imply multi-select |
| Tag counts | Count the union of strict and fuzzy query candidates before applying the selected Tag | Matches the supplied screenshot and makes the rail useful as a facet |
| Tag ordering | Keep corpus document frequency descending, then locale collation | Prevents the list from jumping after every keystroke |
| Fuzzy behavior | Show strict results before deduplicated fuzzy-only results | Preserves typo discovery without allowing approximate matches to outrank precise matches |
| Short Han fuzzy behavior | Disable fuzzy matching for tokens emitted from Han runs shorter than the configured threshold, which must be at least three | Directly fixes the confirmed `网易` failure mode without disabling longer-Han fallback |
| Date order | Default newest first; allow oldest first within each precision tier | Gives the user direct chronological control without allowing fuzzy results to outrank strict results |
| Date influence | Add a small configurable normalized date boost to relevance within a tier | Gives newer documents modest priority while keeping textual relevance dominant |
| Tag-only Post excerpt | Description, then first non-empty paragraph | Uses authored summary content before body fallback |
| Moment excerpt | Complete normalized Moment content; searchable body only | Moments are short, content-first entries and have no searchable title |
| Tests | Add minimal Vitest coverage for pure search logic | Makes tiering, date boost, snippets, facets, and URL state deterministic to verify |
| Result cap | Keep `SITE.search.max_results` and the existing limited-result status | Avoids unrelated pagination scope |

## Target UX Contract

### Page shell

- Keep `src/pages/[lang]/search.astro` under `Layout.astro`.
- Do not wrap the search UI in `CommonPage.astro`; search controls and result rows must not inherit `.article` typography.
- Build the dynamic page width from `SITE.page_width`. The supported width values are already safelisted in `src/styles/global.css`.
- Preserve `px-4 sm:px-6`, the existing top/bottom rhythm, `main.flex-1`, and the body flex/min-height rule so the footer remains stable.

### Desktop layout

Use this semantic shape:

```text
main
  h1
  search-panel
    form[role=search]                 full width
    search-workspace                 two columns
      aside                          Date order + Tag heading/options
      section                        live status + result list
```

Desktop requirements:

- Search form occupies the full panel width.
- Workspace uses approximately `12rem minmax(0, 1fr)` with a restrained gap.
- The left rail contains a `Date order` section followed by a `Tags` section. These headings share the same level.
- The date-order toggle sits under `Date order` and above the Tag list, entirely within the left filter rail.
- The `Tags` heading aligns vertically with the result status.
- The Tag list has a bounded viewport height and its own vertical overflow.
- Results use an ordered list with dividing rules, not floating cards.
- Long English identifiers, URLs, CJK text, and Tags must wrap or truncate without changing grid dimensions.

### Compact layout

At roughly the same width at which the Header collapses (`48rem` today):

- Switch to one column.
- Present a filter disclosure above the result status containing the `Date order` control followed by the `Tags` list.
- Reuse the same listbox DOM; do not render separate desktop and mobile option trees.
- Bound the expanded list height and width to the viewport.
- Use one `matchMedia` controller as the source of truth for compact versus persistent behavior.
- In compact mode, the trigger controls the list. Selection and Escape close it and return focus to the trigger. Focus-loss dismissal leaves the already-moved focus alone. Outside-pointer dismissal must not preempt the pointer's normal focus behavior; after that behavior, return focus to the trigger only if focus would otherwise remain inside the now-hidden list.
- In persistent desktop mode, remove the trigger from both display and the accessibility tree, keep the list visible, and disable outside-pointer/focus-loss dismissal.
- If a breakpoint transition would hide the focused element, expose the destination first, move focus, and only then hide the departing control. When entering compact mode, expose the trigger, focus it if an option held focus, then close the list. When entering persistent mode, expose the list, focus the selected option if the trigger held focus, then hide the trigger.

The breakpoint may be a component-level constant. It does not need a new global abstraction unless another consumer appears.

### Query control

- Keep a real `<form role="search">` and associate a separate `<label for>` with the input; do not wrap the input and its trailing button in one label.
- Keep the leading Tabler search icon.
- Replace the always-visible submit arrow with a trailing clear icon when the input is non-empty, or retain the submit control if product review prefers explicit submission. Enter must continue to submit either way.
- If the custom clear action is approved, suppress the native search cancel control. Clearing cancels the pending debounce, removes only `q`, preserves the selected Tag, updates the URL and results immediately, and returns focus to the input.
- Live input remains debounced.

### Date-order control

- Render one icon-plus-text button inside the left filter block, under a peer-level `Date order` heading and above the peer-level `Tags` heading/list.
- The button displays the current order (`Newest first` or `Oldest first`) and a matching directional icon; the icon is not the only indicator.
- Default to newest-first. Omit `sort=newest` from the URL. Persist oldest-first as `sort=oldest`.
- Changing the control updates only `sort` with `history.replaceState`, preserves `q` and `tag`, and rerenders immediately without a page reload.
- Use `aria-pressed` and a localized accessible name that includes the active order. Do not announce the order on every live result update.
- Sort documents within each precision tier. Do not reorder snippets, reverse relevance, or move fuzzy results ahead of strict results.

### Tag rail

- Keep singular exact, case-sensitive selection unless multi-tag behavior is separately approved.
- Include an `All tags` option.
- Render a count opposite every option and the current query-result total opposite `All tags`.
- Compute counts from query results before the active Tag filter. With an empty query, counts represent the locale corpus.
- Keep the option order based on corpus frequency and locale-aware alphabetical tie-breaking.
- Keep an unknown URL Tag visible with count `0` so the URL state is understandable.
- Do not disable zero-count options; selecting one may intentionally demonstrate an empty combined state.
- Give each component instance a stable, unique id prefix and use it for the input, compact trigger/list relationship, Tag heading, results heading, and status. The search route should pass an explicit prefix; reusable callers must provide a unique value.
- Add `aria-controls` and `aria-expanded` to the compact trigger.
- Keep exactly one listbox option at `tabindex="0"`; initialize it to the selected option, or `All tags` when no Tag is selected.
- Arrow Up/Down, Home, and End move the roving tab stop and focus. Enter or Space selects. Printable-key typeahead should move to the next label match using locale-aware comparison.
- Render visible counts separately from localized accessible option names such as `{tag}, {count} results`; do not rely on visual proximity alone.

### Result row

Each result row contains:

1. An `h2` with the result link and highlighted title occurrences kept inside that link.
2. Compact kind and date metadata.
3. Zero to `SITE.search.max_snippets` match snippets.
4. Existing Tags as compact metadata.

One result remains one row even when it has several matches. Render each selected body/code window as a separate labeled snippet block beneath the shared title and metadata; do not duplicate the result title for each occurrence.

Result rows are separated by a border. They do not receive their own card background, outer border, radius, or shadow.

Dates should preserve their current machine-readable `datetime` value. Date-format normalization is a separate concern and is not required here.

When a query is present, the result list contains a strict tier followed by a fuzzy-only tier when fuzzy candidates exist. Render an approximate-results divider only when at least one fuzzy-only row is visible. When no query is present, Tag-only results have no precision tiers and are ordered directly by the date control.

### Multi-occurrence snippets

Replace singular `getSnippet()` behavior with a pure `getSnippets()` pipeline:

1. Determine the actual terms MiniSearch matched in `title`, `body`, and `code`.
2. Highlight title occurrences independently; titles never produce snippet windows or consume `SITE.search.max_snippets`.
3. Find all case-normalized occurrences in the matching body and code sources.
4. Expand each occurrence by the configured context length.
5. Merge overlapping or adjacent windows.
6. De-duplicate equivalent windows.
7. Associate body/code windows with the nearest preceding stored anchor.
8. Prefer windows covering more distinct query terms, then more occurrences, then the configured field weight, then source order.
9. Return at most `SITE.search.max_snippets` windows.

Presentation requirements:

- Mark every occurrence in every visible title or snippet with `<mark data-search-highlight>`.
- Build marks with text nodes and DOM methods; do not inject result HTML strings.
- Show ellipses only where text was actually trimmed.
- When anchor label metadata exists, render a compact section label above its snippet. Post labels are links; Moment labels are descriptive text in this scope.
- Give code snippets a visible localized `Code` label plus an icon and monospaced text, without placing another card inside the result row.
- Allow body and code snippets to coexist for the same result.
- When a Post has matches under multiple headings, show multiple labeled snippet blocks in that one result row, each with its own heading link and highlighted occurrences.
- Hide the snippet region only when no source text is available.
- For Tag-only Posts, use the stored display description first and the first non-empty normalized body paragraph as fallback. Truncate to the configured excerpt budget only when necessary.
- For Moments, render the complete normalized `displayContent` for both Tag-only and keyword results. Preserve authored paragraph/heading boundaries and authored code text while excluding search-excluded UI.

### Destination links

- Preserve repeated `highlight=` query parameters for Post results.
- For a Post, the title link targets the highest-ranked visible body/code snippet with a non-empty anchor; if no visible snippet has an anchor, it targets `rootAnchor`.
- For a Post, a section label uses the same bounded `highlight=` parameters and links to its own anchor, even when that differs from the title link.
- Anchors remain heading-only (`h2` through `h6`). Code inherits the nearest preceding heading; this refactor does not add per-code-block or footnote-section anchors.
- The Post detail highlighter continues to mark all accepted terms and scroll after layout settles.
- Moment results retain their existing Moment anchor URLs; destination-page highlighting for Moments is not added in this scope.

## Relevance Contract

### Two-pass query policy

For a non-empty query:

1. Run an unfiltered strict pass with `combineWith: "AND"`, prefix matching enabled, and fuzzy matching disabled.
2. Run an unfiltered fuzzy-enabled pass with the Han-run eligibility rule below.
3. Classify every document into the strict tier when every query term has a strict match; otherwise classify it as fuzzy-only only when it has a fuzzy match and is not already strict.
4. Compute Tag counts from the union of deduplicated strict and fuzzy-only candidates before applying the active Tag.
5. Apply the exact active Tag to both tiers. A zero-count Tag remains empty; it does not alter tier classification.
6. Rank each tier with the combined score below, cap the complete ordered list at `SITE.search.max_results`, and report uncapped strict/fuzzy totals.

This preserves typo discovery while making precision a hard ordering boundary. A document with both strict and fuzzy matches belongs entirely to the strict tier.

Within each tier, calculate:

`combined = MiniSearch score + date_boost × normalized date rank`

Normalize date rank within the current active-Tag candidate set: newest dated document is `1`, oldest is `0`, equal dates share a rank, and undated documents receive no date contribution and remain last. Oldest-first inverts only this normalized date rank. Use raw MiniSearch score, normalized date, and localized title as deterministic tie-breakers. `date_boost` is bounded configuration and must remain small enough that textual relevance remains dominant.

The Han guard is based on the original normalized query runs, not the emitted token length:

- Split the query into contiguous Han runs before tokenization.
- Tokens emitted from a one- or two-character Han run remain exact even during the fuzzy pass.
- Tokens emitted from a Han run of at least `SITE.search.han_fuzzy_min_run_length` characters may use edit distance `1` in the fuzzy pass.
- `han_fuzzy_min_run_length` must be an integer of at least `3`; lower values are invalid configuration.
- If the same normalized token is emitted by both an exact-only short run and a fuzzy-eligible longer run, exact-only provenance wins.
- Non-Han terms retain the configured ratio and existing `maxFuzzy: 2` cap.

This query-aware eligibility set is required because a three-character Han run emits overlapping two-character tokens. Checking only each emitted token's length would disable useful longer-query fallback unintentionally.

### Approximate-result disclosure

When fuzzy-only results are present, the live status and divider must state that approximate results are being shown. If there are no strict results, also state that no strict literal or prefix results were found. If the result cap hides fuzzy-only candidates, report their uncapped count without rendering an empty divider.

### Match terms

- Strict results highlight literal/prefix-matched indexed terms.
- Approximate results highlight the actual indexed term that caused the match, not text that does not exist in the result.
- Keep the destination `highlight=` term set bounded to one chosen matched term per normalized query term.

## Data Contract Changes

Keep all existing `data-search-*` producer attributes. Extend stored anchors so section links can show human-readable labels:

```ts
type SearchAnchor = {
  id: string;
  label: string;
  offset: number;
};
```

Extend the stored document metadata without expanding searchable fields:

```ts
type SearchDocument = {
  // searchable only for Posts
  title: string;
  body: string;
  code: string;
  // display and deterministic excerpt metadata
  displayTitle: string;
  description: string;
  firstParagraph: string;
  displayContent: string;
  kind: "post" | "moment";
  date: string;
  // ...existing ids, URLs, anchors, language, and tags
};
```

Post `title`, `body`, and `code` remain MiniSearch fields. Moment `title` is empty or omitted from the searchable field set; its synthetic `Moment · date` heading is stored as `displayTitle`. Moment body remains searchable. `description`, `firstParagraph`, and `displayContent` are display-only and do not affect MiniSearch scores. `displayContent` preserves the complete normalized Moment content, including authored inline and block code text, while excluding syntax UI, gutters, line numbers, controls, SVG, and accessibility-only duplicates.

Extraction rules:

- `id` remains the transformed heading id.
- `label` is normalized visible heading text with excluded UI removed.
- `offset` retains its current meaning within the extracted body or code source.
- Root fallback anchors may use an empty label.
- Only transformed `h2` through `h6` ids enter this schema. A code window inherits its nearest preceding heading label and id; footnote-section ids are not added in this refactor.
- Moment body extraction preserves normalized paragraph and heading boundaries for whole-content rendering while still excluding search-excluded regions.

Add a shared search-index schema version and append it to the fetch URL, for example `/search-index/zh.json?v=2`, whenever stored-field shape changes. This avoids serving a stale serialized MiniSearch payload to a newly deployed client.

No Post or Moment frontmatter change is required.

## Configuration

Keep search-specific user choices under `SITE.search`:

```ts
search: {
  max_results: 30,
  max_snippets: 3,
  snippet_context: 72,
  fuzzy_ratio: 0.2,
  han_fuzzy_min_run_length: 3,
  date_boost: 0.08,
  weights: {
    title: 5,
    body: 1,
    code: 1,
  },
}
```

Notes:

- `snippet_context` is a presentation budget, not indexed content length.
- `han_fuzzy_min_run_length` is measured against each original contiguous Han run, must be at least `3`, and is not measured against emitted bigrams.
- `date_boost` is a small bounded factor applied to normalized date rank within a tier. Its allowed range and default must keep text relevance dominant.
- Strict-before-fuzzy tiering is a search invariant; fuzzy results are not fallback-only, but they may never outrank a strict result.
- `max_results`, `max_snippets`, and context limits bound DOM work.
- Do not scatter equivalent numeric constants through `search-client.ts`.

## Component And Code Ownership

### New file

`src/components/search/search-parts.ts`

Own pure browser-independent presentation helpers:

- strict/fallback result selection and result-mode metadata;
- strict/fuzzy tier classification and bounded date-aware ranking;
- matched-term selection;
- occurrence discovery;
- match-window merge, ranking, and limit logic;
- Tag facet counts;
- Post/Moment display-excerpt selection;
- safe label placeholder interpolation; and
- URL-state serialization helpers, including `sort`, if extracting them makes the functions independently testable.

Do not turn this into a generic utility package. It is adjacent search logic for one component.

### Existing files

| File | Required change |
| --- | --- |
| `src/pages/[lang]/search.astro` | Use the configured page width; keep the normal Layout shell |
| `src/components/search/SearchPanel.astro` | Render full-width form, Tag aside/disclosure, result sections, section/snippet templates, and semantic headings |
| `src/components/search/search-client.ts` | Keep index loading, state, events, and DOM orchestration; delegate pure computation to `search-parts.ts` |
| `src/search/search-core.ts` | Add anchor labels/schema version and expose strict/fuzzy search options without duplicating tokenizer rules |
| `src/search/search-index-integration.ts` | Extract anchor labels, Post display metadata, Moment body/display metadata, and write the revised stored schema |
| `src/components/posts/search-highlight.ts` | Reuse the shared highlight-term normalization where practical; preserve safe text-node marking |
| `src/styles/global.css` | Own the shared light/dark `[data-search-highlight]` treatment |
| `src/styles/article.css` | Remove the duplicate article-only mark colors after the shared rule exists |
| `src/i18n/ui.ts` | Add every new clear, filter, code-match, and approximate-result label to `en` and `zh` |
| `src/config.ts` | Add snippet choices, the Han-run fuzzy threshold, and bounded `date_boost` |

`Article.astro` and `MomentCard.astro` should remain unchanged unless implementation proves an additional producer attribute is necessary.

## State And Interaction Contract

- Empty `q` and empty `tag`: render no results and an empty status, as today.
- Query only: strict tier followed by fuzzy-only tier when eligible candidates exist.
- Tag only: wildcard search filtered by the exact Tag and ordered by the date control, with Post/Moment excerpt rules above.
- Query plus Tag: classify strict/fuzzy tiers from the unfiltered query, compute union facets, then apply the exact Tag.
- Input changes: debounce, update via `history.replaceState`, and render without reload.
- Sort changes: update only `sort`, preserve `q` and `tag`, and rerender immediately.
- Explicit form submission: flush the debounce, update URL state, and render.
- Back/forward: read `q`, `tag`, and `sort`, synchronize controls, close compact filters, and render.
- Reload/direct link: restore all three fields from the URL before the first render. Unknown sort values resolve to newest-first.
- Invalid Tag: preserve it visibly, count `0`, and show the empty state.
- Index load failure: clear `aria-busy` and render the localized error without throwing into the page.

## Accessibility Requirements

1. Keep `<form role="search">` and a separate `<label for>` for the query field.
2. Keep `aria-busy` on the component until index initialization completes or fails.
3. Keep one atomic `role="status"` live region for loading, strict/fuzzy counts, approximate-result disclosure, empty, limited, and error states.
4. Give the results section a separate persistent heading and reference it with `aria-labelledby`; do not use the changing live status as its label.
5. Use `<aside aria-labelledby>` for the Tag rail and `<section aria-labelledby>` for results.
6. Use an ordered result list and one `h2` per result.
7. Preserve listbox/option single-selection semantics, `aria-selected`, exactly one roving tab stop, and the keyboard contract above.
8. Use instance-unique ids for every label/control relationship.
9. Give Tag counts localized accessible names, date-order state an accessible button name, and code matches a visible textual label.
10. Preserve visible focus rings in both themes.
11. Use semantic `<mark>` inside links where applicable and meet readable foreground/background contrast in light and dark modes.
12. Do not communicate match field or selection through color alone.
13. Respect reduced motion; no new result or highlight animation is required.

## Visual Requirements

- Follow the existing neutral gray surfaces and blue interactive accent; do not copy the reference site's palette.
- Search input and compact disclosure may use `rounded-lg`; options and small metadata may use `rounded-md`.
- Do not place result cards inside a page-level card.
- Keep type compact: page `h1` at the current scale, result `h2` around `text-lg`, snippets at readable body size.
- Use the installed Tabler icon set for search, clear, Tag, disclosure, kind, or code cues.
- Define stable icon-button dimensions so loading and clear-state changes do not shift the input.
- Ensure all new styles have explicit light and `[data-theme="dark"]` states.

## Performance Requirements

1. Load only the current locale index.
2. Fetch the index once per component initialization.
3. Keep the multiple-instance `WeakSet` guard.
4. Bound rendering to `max_results * max_snippets` snippet nodes, plus one bounded full-content Moment node per visible result.
5. Do not clone or parse rendered result HTML strings.
6. Record raw and compressed locale index sizes before and after the schema change.
7. A compressed index-size increase greater than 10% over the same content requires review.
8. Keep input debounce at approximately the current 120 ms unless measured behavior justifies a change.
9. Avoid layout reads inside the per-result render loop.
10. Compute date ranks once per render from the active candidate set; do not recalculate them per snippet.

## Implementation Phases

### Phase 1: Relevance and pure helpers

1. Add strict/fuzzy tier classification and strict-before-fuzzy ordering.
2. Add the query-aware Han-run fuzzy guard.
3. Add bounded date-aware ranking and `sort` URL state.
4. Extract pure match, snippet, facet, excerpt, and result-selection functions into `search-parts.ts`.
5. Cover the confirmed Chinese failure, tier ordering, date boost, and English/identifier cases with focused tests before changing layout.

Exit criterion: the current `网易` corpus puts literal/prefix results in the strict tier, keeps short-Han fuzzy disabled, and never allows an approximate result to precede a strict result.

### Phase 2: Index metadata

1. Add anchor labels to the shared schema.
2. Extract heading labels for body and code anchors.
3. Add and apply the index schema version.
4. Rebuild and compare document counts and payload sizes.

Exit criterion: every existing document still loads, and stored anchors provide stable ids, labels, and offsets.

### Phase 3: Layout and rendering

1. Move the query bar above the workspace.
2. Add the date-order toggle below the query bar and wire its URL state.
3. Build the persistent desktop Tag rail and compact disclosure from one DOM tree.
4. Render union strict/fuzzy counts without reordering the rail.
5. Replace cards with divided semantic result rows and the approximate divider.
6. Render highlighted titles, bounded multi-occurrence Post snippets, and full Moment content.

Exit criterion: desktop and compact layouts match the target hierarchy without overflow or layout shift.

### Phase 4: Integration and polish

1. Unify search highlight styling across results and Post detail pages.
2. Add localized sort, tier, excerpt, and approximate-result labels.
3. Verify URL restoration, Post heading links, focus behavior, dismissal, date ordering, and error states.
4. Complete the production build, pure-helper tests, and full browser matrix.

Exit criterion: every acceptance criterion below is evidenced.

## Acceptance Criteria

### Relevance

- **SRCH-01:** With the 2026-09-30 content snapshot, `q=网易` returns the four literal matching documents and does not include `网格`, `网站`, `网友`, `网址`, `网络`, or `容易` while literal results exist.
- **SRCH-02:** A query with strict and fuzzy matches renders strict rows first, then a labeled fuzzy-only tier with duplicates removed.
- **SRCH-03:** A query with no strict results can still render eligible fuzzy-only results and visibly identifies them as approximate.
- **SRCH-04:** Tokens emitted from one- and two-character Han runs never use fuzzy matching.
- **SRCH-05:** A fixture containing a Han run at or above the configured threshold with one substituted character exercises and passes the query-aware fuzzy tier; a duplicated token with short-run provenance remains exact-only.
- **SRCH-06:** Title, body, and code weights still come from `SITE.search.weights`; Moment display titles do not participate in matching.
- **SRCH-07:** Strict/fuzzy tier classification and union facet counts are computed before exact Tag filtering. A zero-count Tag remains empty and does not alter tier classification.
- **SRCH-08:** Within a tier, the bounded date boost influences order without allowing date to override a materially stronger textual match; oldest-first reverses only date influence.

### Presentation

- **SRCH-09:** The search bar spans the panel above the date toggle, Tags, and results.
- **SRCH-10:** The date toggle displays current order, defaults to newest-first, persists only `sort=oldest`, and updates without reload.
- **SRCH-11:** At desktop width, Tags form a persistent left rail and results occupy the flexible right column.
- **SRCH-12:** At compact width, Tags use one bounded disclosure above results without duplicate option DOM.
- **SRCH-13:** Results are separated rows rather than cards.
- **SRCH-14:** All visible strict or accepted approximate occurrences in titles and snippets are wrapped in semantic marks; title marks remain inside the title link.
- **SRCH-15:** A result with separated matches can render multiple distinct Post body/code snippets up to the configured limit; title matching does not consume that limit.
- **SRCH-16:** Body and code snippets can both render for one Post, and code matches have a localized textual cue.
- **SRCH-17:** For a Post with matches under two headings, the title link uses the highest-ranked visible anchored snippet and each section label uses its own anchor, with the same bounded highlight parameters.
- **SRCH-18:** Tag-only Posts use description then first paragraph; Moments use complete normalized `displayContent`; synthetic Moment labels are never highlighted.

### Tags and state

- **SRCH-19:** Every Tag displays its count from the union of strict/fuzzy query candidates; `All tags` displays the unfiltered union count.
- **SRCH-20:** Tag order stays stable while query-relative counts update.
- **SRCH-21:** Query-only, Tag-only, combined, and oldest-first states round-trip through the URL and reload.
- **SRCH-22:** Browser history restoration synchronizes query, Tag, sort, status, tiers, and result list.
- **SRCH-23:** An unknown URL Tag remains visible with count `0` and produces a localized empty state.

### Quality

- **SRCH-24:** English and Chinese pages render only their own locale index.
- **SRCH-25:** Light and dark highlights meet readable contrast and do not obscure text selection.
- **SRCH-26:** Keyboard users can reach, traverse, type ahead, and select in both Tag modes; compact Escape and selection return focus, focus-loss dismissal preserves moved focus, and outside-pointer dismissal never leaves focus in the hidden list.
- **SRCH-27:** Focus remains valid when the viewport crosses the compact breakpoint with focus on the trigger or inside the listbox.
- **SRCH-28:** The custom clear control cancels pending input work, removes only `q`, preserves `tag` and `sort`, updates the URL/results, and refocuses the input.
- **SRCH-29:** Each component instance has unique ARIA ids, a stable results label separate from the atomic live status, accessible Tag counts, and a single listbox tab stop.
- **SRCH-30:** Loading, strict/fuzzy counts, approximate, limited, sort, clear, count, excerpt, and error labels are localized in both dictionaries.
- **SRCH-31:** `pnpm build` completes and writes both locale indexes with the expected content-dependent document counts.
- **SRCH-32:** Compressed index size does not grow by more than 10% for unchanged content without explicit review.

## Verification Matrix

### Automated

The repository currently has no test runner. The implementation should add the smallest Vite-compatible Vitest setup needed for pure helpers. Required cases are:

- strict result present versus fuzzy fallback;
- strict/fuzzy tier classification with deduplication;
- short Han fuzzy guard (`网易`);
- three-or-more-character Han typo fallback;
- duplicated-token precedence across short and long Han runs;
- English typo fallback;
- bounded date boost, newest/oldest inversion, equal-date ties, and missing-date placement;
- identifier and code token matching;
- overlapping-window merge;
- separated-window retention;
- per-result snippet cap;
- Tag-only Post description/paragraph fallback;
- complete Moment body rendering and display-only synthetic label;
- title/body/code occurrence highlighting terms and title-independent snippet quota;
- deterministic title/section URLs for matches under two headings;
- query-relative Tag counts and stable order;
- strict mode with a selected zero-count Tag;
- URL state parsing/serialization for `q`, `tag`, and `sort`; and
- invalid Tag state.

### Build

1. Run `pnpm build`.
2. Confirm `dist/search-index/en.json` and `dist/search-index/zh.json` exist.
3. Record document count plus raw, gzip, and Brotli size for each locale.
4. Confirm no Post-list duplicate documents enter the index.
5. Confirm body text excludes code, controls, templates, SVG, and KaTeX accessibility duplication.
6. Confirm code text excludes gutters and line numbers.

### Browser

Use the existing `http://localhost:4444` instance after rebuilding. Do not start another server.

Test both `/en/search/` and `/zh/search/` in light and dark themes at desktop and narrow mobile widths:

1. empty initial state;
2. exact title match;
3. exact body match;
4. exact code match;
5. fuzzy tier with disclosure;
6. `网易` precision regression;
7. query with multiple appearances in one section;
8. query with appearances across several headings;
9. Tag-only state;
10. query plus Tag;
11. zero-count and invalid Tag;
12. limited-result status;
13. clear action;
14. direct URL reload;
15. back/forward restoration;
16. newest/oldest ordering and URL persistence;
17. desktop Tag keyboard navigation;
18. compact Tag open, traversal, selection, Escape, outside pointer, and focus-loss dismissal;
19. focus transfer while crossing the compact breakpoint;
20. Post title/section navigation across two heading anchors and destination highlights;
21. long Tag, title, English identifier, CJK snippet, and code overflow; and
22. simulated index-load failure.

For Markdown integration, spot-check a nested Post detail route containing headings, code, math, footnotes, images, and video so the search anchor/highlight behavior does not disturb the article pipeline.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Fuzzy results dilute precision | Keep a hard strict-before-fuzzy tier boundary and label the fuzzy tier |
| Multi-snippet rendering increases DOM work | Cap results and snippets in configuration; merge and de-duplicate windows before DOM creation |
| Anchor schema changes meet stale cached JSON | Version the index fetch URL with the shared schema version |
| Query-relative Tag counts cause visual churn | Keep Tag ordering based on stable corpus frequency rather than live counts |
| Date boost overwhelms textual relevance | Bound `date_boost`, normalize within candidates, and test materially different scores |
| Persistent desktop listbox becomes unreachable | Give the selected option a roving tab stop and preserve Arrow/Home/End behavior |
| One DOM tree must serve two layouts | Make viewport mode an explicit controller state and test focus during breakpoint changes |
| Heading labels duplicate indexed content | Store only normalized anchor labels; measure payload before and after |
| Full Moment content increases result height | Moments are capped by result count; preserve content boundaries and avoid duplicate source nodes |
| Pagefind reference encourages an unmeasured engine migration | Keep this decision scoped to incremental delivery; revisit after the focused prototype defined in the architecture decision |

## Implementation Notes

The product decisions above are settled. Implementation should preserve the existing explicit submit behavior only if the clear control cannot be made accessible without ambiguity; otherwise use the approved custom clear control. The date toggle is a separate control and must not replace Enter submission.

## Sources

- Astro, [Scripts and event handling](https://docs.astro.build/en/guides/client-side-scripts/)
- Astro, [`astro:build:done` integration hook](https://docs.astro.build/en/reference/integrations-reference/#astrobuilddone)
- Astro, [Internationalization: create links](https://docs.astro.build/en/guides/internationalization/#create-links)
- Pagefind, [Getting started](https://pagefind.app/docs/)
- Pagefind, [Node API and custom records](https://pagefind.app/docs/node-api/)
- Pagefind, [Multiple results per page](https://pagefind.app/docs/sub-results/)
- Pagefind, [Filtering and query-relative counts](https://pagefind.app/docs/js-api-filtering/)
- Pagefind, [Weighting search terms](https://pagefind.app/docs/weighting/)
- Pagefind, [Multilingual search](https://pagefind.app/docs/multilingual/)
- Live reference, [Arthals' ink search](https://arthals.ink/search)

---
*Specification prepared: 2026-10-01*
