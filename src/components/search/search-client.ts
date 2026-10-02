import MiniSearch, { type SearchResult } from "minisearch";
import { dismissWhenInactive } from "@/components/utils/dismissible";
import { getSearchOptions, type SearchDocument } from "@/search/search-core";
import { type Lang } from "@/i18n/ui";
import {
  fillLabel,
  filterSearchResults,
  getFallbackExcerpt,
  getHighlightTerms,
  getSnippets,
  getTagFacets,
  rankSearchResults,
  readSearchSort,
  searchResultSets,
  type SearchSnippet,
  type SearchSort,
  type StoredSearchResult,
} from "./search-parts";

type SearchLabels = {
  results: string;
  resultsLimited: string;
  resultBreakdown: string;
  empty: string;
  error: string;
  approximateHeading: string;
  approximateStatus: string;
  noPrecise: string;
  post: string;
  moment: string;
  codeMatch: string;
  sectionMatch: string;
  query: string;
  clear: string;
  newest: string;
  oldest: string;
  filterOpen: string;
  filterClose: string;
  tagCount: string;
};

const initialized = new WeakSet<HTMLElement>();

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing search element: ${selector}`);
  return element;
}

function readLabels(root: HTMLElement): SearchLabels {
  return {
    results: root.dataset.labelResults ?? "{count} results",
    resultsLimited: root.dataset.labelResultsLimited ?? "Showing {shown} of {count} results",
    resultBreakdown: root.dataset.labelResultBreakdown ?? "{precise} precise, {approximate} approximate",
    empty: root.dataset.labelEmpty ?? "No results",
    error: root.dataset.labelError ?? "Search unavailable",
    approximateHeading: root.dataset.labelApproximateHeading ?? "Approximate matches",
    approximateStatus: root.dataset.labelApproximateStatus ?? "{count} approximate matches shown",
    noPrecise: root.dataset.labelNoPrecise ?? "No precise matches found",
    post: root.dataset.labelPost ?? "Post",
    moment: root.dataset.labelMoment ?? "Moment",
    codeMatch: root.dataset.labelCodeMatch ?? "Code match",
    sectionMatch: root.dataset.labelSectionMatch ?? "Section match: {label}",
    query: root.dataset.labelQuery ?? "Search query",
    clear: root.dataset.labelClear ?? "Clear search",
    newest: root.dataset.labelNewest ?? "Newest first",
    oldest: root.dataset.labelOldest ?? "Oldest first",
    filterOpen: root.dataset.labelFilterOpen ?? "Show search filters",
    filterClose: root.dataset.labelFilterClose ?? "Hide search filters",
    tagCount: root.dataset.labelTagCount ?? "{tag}, {count} results",
  };
}

function appendHighlightedText(
  target: HTMLElement,
  text: string,
  terms: string[],
  trimmedStart = false,
  trimmedEnd = false,
): void {
  target.replaceChildren();
  if (trimmedStart) target.append(document.createTextNode("…"));
  const escaped = [...new Set(terms)]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) {
    target.append(document.createTextNode(text));
  } else {
    const pattern = new RegExp(`(${escaped.join("|")})`, "giu");
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      target.append(document.createTextNode(text.slice(lastIndex, index)));
      const mark = document.createElement("mark");
      mark.dataset.searchHighlight = "";
      mark.textContent = match[0];
      target.append(mark);
      lastIndex = index + match[0].length;
    }
    target.append(document.createTextNode(text.slice(lastIndex)));
  }
  if (trimmedEnd) target.append(document.createTextNode("…"));
}

function buildResultUrl(
  result: StoredSearchResult,
  terms: string[],
  anchorId = "",
): string {
  if (result.kind !== "post" || terms.length === 0) return result.url;
  const url = new URL(result.url, window.location.origin);
  for (const term of terms) url.searchParams.append("highlight", term);
  url.hash = anchorId || result.rootAnchor;
  return `${url.pathname}${url.search}${url.hash}`;
}

function updateOptionTabStops(options: HTMLButtonElement[], selected: string): void {
  let active = false;
  for (const option of options) {
    const isSelected = option.dataset.value === selected;
    option.setAttribute("aria-selected", String(isSelected));
    const canTab = !active && (isSelected || option === options[0]);
    option.tabIndex = canTab ? 0 : -1;
    if (canTab) active = true;
  }
}

async function initializeSearch(root: HTMLElement): Promise<void> {
  if (initialized.has(root)) return;
  initialized.add(root);

  const lang = root.dataset.lang as Lang;
  const labels = readLabels(root);
  const indexUrl = root.dataset.indexUrl;
  const maxResults = Number(root.dataset.maxResults) || 30;
  const maxSnippets = Number(root.dataset.maxSnippets) || 3;
  const form = requiredElement<HTMLFormElement>(root, "[data-search-form]");
  const queryInput = requiredElement<HTMLInputElement>(root, "[data-search-query]");
  const queryAction = requiredElement<HTMLButtonElement>(root, "[data-search-query-action]");
  const sortButton = requiredElement<HTMLButtonElement>(root, "[data-search-sort]");
  const sortLabel = requiredElement<HTMLElement>(root, "[data-search-sort-label]");
  const sortIcon = requiredElement<HTMLElement>(root, "[data-search-sort-icon]");
  const filterToggle = requiredElement<HTMLButtonElement>(root, "[data-search-filter-toggle]");
  const filterAside = requiredElement<HTMLElement>(root, "[data-search-filters] > aside");
  const filterLabel = requiredElement<HTMLElement>(root, "[data-search-filter-label]");
  const tagControl = requiredElement<HTMLElement>(root, "[data-search-tag-control]");
  const tagInput = requiredElement<HTMLInputElement>(root, "[data-search-tag]");
  const tagButton = requiredElement<HTMLButtonElement>(root, "[data-search-tag-button]");
  const tagValue = requiredElement<HTMLElement>(root, "[data-search-tag-value]");
  const tagList = requiredElement<HTMLElement>(root, "[data-search-tag-list]");
  const status = requiredElement<HTMLElement>(root, "[data-search-status]");
  const resultList = requiredElement<HTMLOListElement>(root, "[data-search-results]");
  const resultTemplate = requiredElement<HTMLTemplateElement>(root, "[data-search-result-template]");
  const snippetTemplate = requiredElement<HTMLTemplateElement>(root, "[data-search-snippet-template]");
  const tagTemplate = requiredElement<HTMLTemplateElement>(root, "[data-search-tag-template]");
  const optionTemplate = requiredElement<HTMLTemplateElement>(root, "[data-search-tag-option-template]");
  const media = window.matchMedia("(min-width: 48rem)");
  let compactMode = !media.matches;
  let sort: SearchSort = "newest";
  let filterOpen = false;
  let tagMenuOpen = false;
  let inputTimer: ReturnType<typeof setTimeout> | undefined;
  let index: MiniSearch<SearchDocument>;

  const getOptions = () => Array.from(tagList.querySelectorAll<HTMLButtonElement>("[data-search-tag-option]"));
  const compact = () => !media.matches;

  const syncFilterMode = () => {
    if (compact()) {
      filterToggle.hidden = false;
      filterAside.hidden = !filterOpen;
      filterToggle.setAttribute("aria-expanded", String(filterOpen));
      filterLabel.textContent = filterOpen ? labels.filterClose : labels.filterOpen;
    } else {
      filterToggle.hidden = true;
      filterAside.hidden = false;
      filterToggle.setAttribute("aria-expanded", "false");
    }
  };

  const syncTagMode = () => {
    tagButton.hidden = !compact();
    tagList.hidden = compact() ? !tagMenuOpen : false;
    tagButton.setAttribute("aria-expanded", String(tagMenuOpen));
  };

  const syncResponsiveMode = () => {
    const nextCompactMode = compact();
    let focusFilterToggle = false;
    let focusTagButton = false;
    if (nextCompactMode !== compactMode) {
      const active = document.activeElement;
      if (nextCompactMode) {
        filterToggle.hidden = false;
        tagButton.hidden = false;
        if (active && tagList.contains(active)) focusTagButton = true;
        else if (active && filterAside.contains(active)) focusFilterToggle = true;
        filterOpen = focusTagButton || focusFilterToggle;
        tagMenuOpen = false;
      } else {
        tagList.hidden = false;
        if (active === tagButton) {
          const options = getOptions();
          const selected = options.find((option) => option.dataset.value === tagInput.value) ?? options[0];
          selected?.focus();
        }
        if (active === filterToggle) sortButton.focus();
        filterOpen = false;
        tagMenuOpen = false;
      }
      compactMode = nextCompactMode;
    }
    syncFilterMode();
    syncTagMode();
    if (focusFilterToggle) window.setTimeout(() => filterToggle.focus());
    if (focusTagButton) window.setTimeout(() => tagButton.focus());
  };

  const setFilterOpen = (open: boolean) => {
    filterOpen = open;
    syncFilterMode();
  };

  const setTagMenuOpen = (open: boolean, focusSelected = false, restoreFocus = false) => {
    tagMenuOpen = open;
    syncTagMode();
    if (!open && restoreFocus && compact()) {
      window.setTimeout(() => {
        if (tagList.contains(document.activeElement)) tagButton.focus();
      });
    }
    if (!open || !focusSelected) return;
    const options = getOptions();
    const selected = options.find((option) => option.dataset.value === tagInput.value) ?? options[0];
    selected?.focus();
  };

  const updateTagSelection = () => {
    const options = getOptions();
    const selected = options.find((option) => option.dataset.value === tagInput.value);
    tagValue.textContent = selected?.querySelector<HTMLElement>("[data-search-tag-option-label]")?.textContent?.trim() ?? tagInput.value;
    updateOptionTabStops(options, tagInput.value);
  };

  const readUrlState = () => {
    const params = new URLSearchParams(window.location.search);
    queryInput.value = params.get("q") ?? "";
    tagInput.value = params.get("tag") ?? "";
    sort = readSearchSort(params.get("sort"));
    updateTagSelection();
  };

  const writeUrlState = () => {
    const url = new URL(window.location.href);
    const query = queryInput.value.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (tagInput.value) url.searchParams.set("tag", tagInput.value);
    else url.searchParams.delete("tag");
    if (sort === "oldest") url.searchParams.set("sort", "oldest");
    else url.searchParams.delete("sort");
    window.history.replaceState(null, "", url);
  };

  const updateSortButton = () => {
    const newest = sort === "newest";
    sortLabel.textContent = newest ? labels.newest : labels.oldest;
    sortButton.setAttribute("aria-pressed", String(!newest));
    sortButton.setAttribute("aria-label", newest ? labels.newest : labels.oldest);
    sortIcon.setAttribute("data-sort", sort);
    sortIcon.setAttribute("aria-label", newest ? labels.newest : labels.oldest);
  };

  const addTagOptions = (corpus: StoredSearchResult[]) => {
    const facets = getTagFacets({ precise: corpus, approximate: [] });
    if (tagInput.value && !facets.some(({ tag }) => tag === tagInput.value)) facets.push({ tag: tagInput.value, count: 0 });
    const fragment = document.createDocumentFragment();
    for (const facet of facets) {
      const item = optionTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
      if (!item) continue;
      const option = requiredElement<HTMLButtonElement>(item, "[data-search-tag-option]");
      option.dataset.value = facet.tag;
      option.title = facet.tag;
      requiredElement<HTMLElement>(option, "[data-search-tag-option-label]").textContent = facet.tag;
      fragment.append(item);
    }
    tagList.append(fragment);
    updateTagSelection();
  };

  const updateFacetCounts = (sets: ReturnType<typeof searchResultSets>) => {
    const counts = new Map(getTagFacets(sets).map((facet) => [facet.tag, facet.count]));
    const total = sets.precise.length + sets.approximate.length;
    for (const option of getOptions()) {
      const value = option.dataset.value ?? "";
      const count = value ? counts.get(value) ?? 0 : total;
      requiredElement<HTMLElement>(option, "[data-search-tag-option-count]").textContent = String(count);
      const label = requiredElement<HTMLElement>(option, "[data-search-tag-option-label]").textContent ?? "";
      option.setAttribute("aria-label", fillLabel(labels.tagCount, { tag: label, count }));
    }
  };

  const renderSnippet = (item: HTMLElement, result: StoredSearchResult, snippet: SearchSnippet, terms: string[]) => {
    const node = snippetTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (!node) return;
    const link = requiredElement<HTMLAnchorElement>(node, "[data-result-section-link]");
    const linkLabel = requiredElement<HTMLElement>(node, "[data-result-section-label]");
    const codeIcon = requiredElement<HTMLElement>(node, "[data-result-code-icon]");
    const content = requiredElement<HTMLElement>(node, "[data-result-snippet-content]");
    const title = snippet.field === "code"
      ? labels.codeMatch
      : snippet.anchorLabel
        ? fillLabel(labels.sectionMatch, { label: snippet.anchorLabel })
        : "";
    if (title) {
      linkLabel.textContent = title;
      codeIcon.hidden = snippet.field !== "code";
      link.href = buildResultUrl(result, terms, snippet.anchorId);
    } else {
      link.hidden = true;
    }
    appendHighlightedText(content, snippet.text, terms, snippet.trimmedStart, snippet.trimmedEnd);
    requiredElement<HTMLElement>(item, "[data-result-snippets]").append(node);
  };

  const render = () => {
    const query = queryInput.value.trim();
    const unfiltered = searchResultSets(index, query, lang);
    updateFacetCounts(unfiltered);
    const filtered = filterSearchResults(unfiltered, tagInput.value);
    const ranked = rankSearchResults(filtered, sort).slice(0, maxResults);
    const preciseCount = filtered.precise.length;
    const approximateCount = filtered.approximate.length;
    const totalCount = preciseCount + approximateCount;
    resultList.replaceChildren();
    updateSortButton();

    if (totalCount === 0) {
      status.textContent = labels.empty;
      return;
    }

    const visibleApproximate = ranked.filter((result) => result.tier === "approximate").length;
    const breakdown = fillLabel(labels.resultBreakdown, { precise: preciseCount, approximate: approximateCount });
    const countText = totalCount > ranked.length
      ? fillLabel(labels.resultsLimited, { shown: ranked.length, count: totalCount })
      : fillLabel(labels.results, { count: totalCount });
    status.textContent = `${query && preciseCount === 0 ? `${labels.noPrecise}. ` : ""}${countText} · ${breakdown}${visibleApproximate > 0 ? ` · ${fillLabel(labels.approximateStatus, { count: visibleApproximate })}` : ""}`;

    const fragment = document.createDocumentFragment();
    let approximateDividerAdded = false;
    for (const result of ranked) {
      if (result.tier === "approximate" && !approximateDividerAdded) {
        const divider = document.createElement("li");
        divider.dataset.searchTierDivider = "approximate";
        divider.className = "border-b border-gray-200 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400";
        divider.textContent = labels.approximateHeading;
        fragment.append(divider);
        approximateDividerAdded = true;
      }
      const item = resultTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
      if (!item) continue;
      const terms = query ? getHighlightTerms(result, query, lang) : [];
      const snippets = getSnippets(result, terms, lang, undefined, maxSnippets);
      const title = requiredElement<HTMLAnchorElement>(item, "[data-result-title]");
      title.href = buildResultUrl(result, terms, snippets.find((snippet) => snippet.anchorId)?.anchorId ?? "");
      appendHighlightedText(title, result.displayTitle, result.kind === "post" ? terms : []);
      requiredElement<HTMLElement>(item, "[data-result-kind]").textContent = result.kind === "post" ? labels.post : labels.moment;
      const date = requiredElement<HTMLTimeElement>(item, "[data-result-date]");
      date.dateTime = result.date;
      date.textContent = result.date;
      date.hidden = !result.date;
      for (const snippet of snippets) renderSnippet(item, result, snippet, terms);
      const fallback = requiredElement<HTMLElement>(item, "[data-result-fallback]");
      fallback.hidden = snippets.length > 0;
      if (!fallback.hidden) appendHighlightedText(fallback, getFallbackExcerpt(result), terms);
      const tags = requiredElement<HTMLElement>(item, "[data-result-tags]");
      for (const resultTag of result.tags) {
        const tag = tagTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
        if (!tag) continue;
        tag.textContent = resultTag;
        tags.append(tag);
      }
      fragment.append(item);
    }
    resultList.append(fragment);
  };

  try {
    readUrlState();
    if (!indexUrl) throw new Error("Missing search index URL");
    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error(`Search index request failed: ${response.status}`);
    index = await MiniSearch.loadJSONAsync<SearchDocument>(await response.text(), getSearchOptions(lang));
    addTagOptions(index.search(MiniSearch.wildcard) as StoredSearchResult[]);
    root.setAttribute("aria-busy", "false");
    syncResponsiveMode();

    queryInput.addEventListener("input", () => {
      window.clearTimeout(inputTimer);
      inputTimer = window.setTimeout(() => { writeUrlState(); render(); }, 120);
    });
    queryAction.addEventListener("click", () => {
      window.clearTimeout(inputTimer);
      queryInput.value = "";
      writeUrlState();
      render();
      queryInput.focus();
      window.setTimeout(() => queryInput.focus());
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.clearTimeout(inputTimer);
      writeUrlState();
      render();
    });
    queryInput.addEventListener("input", () => { queryAction.hidden = !queryInput.value; });
    queryAction.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      queryInput.focus();
    });
    queryAction.addEventListener("pointerup", () => {
      window.setTimeout(() => queryInput.focus());
    });
    filterToggle.addEventListener("click", () => setFilterOpen(!filterOpen));
    sortButton.addEventListener("click", () => { sort = sort === "newest" ? "oldest" : "newest"; writeUrlState(); render(); });
    tagButton.addEventListener("click", () => setTagMenuOpen(!tagMenuOpen, true));
    tagButton.addEventListener("keydown", (event) => {
      if (!compact() || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      event.preventDefault();
      setTagMenuOpen(true, true);
    });
    tagList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const option = target.closest<HTMLButtonElement>("[data-search-tag-option]");
      if (!option) return;
      tagInput.value = option.dataset.value ?? "";
      updateTagSelection();
      writeUrlState();
      render();
      if (compact()) setTagMenuOpen(false, false, true);
    });
    tagList.addEventListener("keydown", (event) => {
      const options = getOptions();
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      let next: number | undefined;
      if (event.key === "ArrowDown") next = (current + 1) % options.length;
      else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Escape" && compact()) { event.preventDefault(); setTagMenuOpen(false, false, true); return; }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); (document.activeElement as HTMLButtonElement)?.click(); return; }
      if (next === undefined) return;
      event.preventDefault();
      options[next]?.focus();
    });
    dismissWhenInactive({ root: tagControl, isOpen: () => tagMenuOpen, isEnabled: compact, close: () => setTagMenuOpen(false, false, true) });
    media.addEventListener("change", syncResponsiveMode);
    window.addEventListener("resize", syncResponsiveMode);
    window.addEventListener("popstate", () => { readUrlState(); setFilterOpen(false); setTagMenuOpen(false); queryAction.hidden = !queryInput.value; render(); });
    queryAction.hidden = !queryInput.value;
    render();
  } catch (error) {
    console.error(error);
    root.setAttribute("aria-busy", "false");
    status.textContent = labels.error;
  }
}

document.querySelectorAll<HTMLElement>("[data-search-root]").forEach((root) => { void initializeSearch(root); });
