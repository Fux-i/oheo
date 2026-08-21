import MiniSearch, { type SearchResult } from "minisearch";
import { dismissWhenInactive } from "@/components/utils/dismissible";
import {
  getSearchOptions,
  tokenizeSearchText,
  type SearchAnchor,
  type SearchDocument,
} from "@/search/search-core";
import { type Lang } from "@/i18n/ui";

type StoredSearchResult = SearchResult & Omit<SearchDocument, "id">;

type SearchLabels = {
  results: string;
  resultsLimited: string;
  empty: string;
  error: string;
  post: string;
  moment: string;
};

const initialized = new WeakSet<HTMLElement>();

function getMatchedField(result: StoredSearchResult): "body" | "code" | null {
  const matchedFields = Object.values(result.match).flat();
  if (matchedFields.includes("body")) return "body";
  if (matchedFields.includes("code")) return "code";
  return null;
}

function getMatchPosition(
  source: string,
  terms: string[],
  lang: Lang,
): number {
  const normalized = source.toLocaleLowerCase(lang);
  const positions = terms
    .map((term) => normalized.indexOf(term.toLocaleLowerCase(lang)))
    .filter((position) => position >= 0);
  return positions.length > 0 ? Math.min(...positions) : 0;
}

function getEditDistance(left: string, right: string): number {
  const leftCharacters = [...left];
  const rightCharacters = [...right];
  let previous = rightCharacters.map((_, index) => index + 1);

  for (let leftIndex = 0; leftIndex < leftCharacters.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (
      let rightIndex = 0;
      rightIndex < rightCharacters.length;
      rightIndex += 1
    ) {
      current.push(
        Math.min(
          current[rightIndex] + 1,
          previous[rightIndex + 1] + 1,
          previous[rightIndex] +
            (leftCharacters[leftIndex] === rightCharacters[rightIndex] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }

  return previous.at(-1) ?? leftCharacters.length;
}

function getHighlightTerms(
  result: StoredSearchResult,
  query: string,
  lang: Lang,
): string[] {
  const matchedField = getMatchedField(result);
  const fieldTerms = matchedField
    ? result.terms.filter((term) => result.match[term]?.includes(matchedField))
    : result.terms;
  const candidates = fieldTerms.length > 0 ? fieldTerms : result.terms;

  return [
    ...new Set(
      tokenizeSearchText(query, lang, true).map((queryTerm) =>
        candidates.reduce((best, candidate) => {
          const bestDistance = getEditDistance(queryTerm, best);
          const candidateDistance = getEditDistance(queryTerm, candidate);
          const queryLength = [...queryTerm].length;
          const bestLengthDifference = Math.abs(
            queryLength - [...best].length,
          );
          const candidateLengthDifference = Math.abs(
            queryLength - [...candidate].length,
          );
          return candidateDistance < bestDistance ||
            (candidateDistance === bestDistance &&
              candidateLengthDifference < bestLengthDifference)
            ? candidate
            : best;
        }),
      ),
    ),
  ];
}

function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing search element: ${selector}`);
  return element;
}

function fillLabel(
  label: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    label,
  );
}

function getSnippet(
  result: StoredSearchResult,
  terms: string[],
  lang: Lang,
): string {
  const matchedField = getMatchedField(result);
  const source = matchedField ? result[matchedField] : result.body || result.code;
  if (!source) return "";

  const matchPosition = getMatchPosition(source, terms, lang);
  const start = Math.max(0, matchPosition - 24);
  const end = Math.min(source.length, matchPosition + 140);
  return `${start > 0 ? "..." : ""}${source.slice(start, end).trim()}${end < source.length ? "..." : ""}`;
}

function getClosestAnchor(
  anchors: SearchAnchor[],
  matchPosition: number,
  fallback: string,
): string {
  let anchor = fallback;
  for (const candidate of anchors) {
    if (candidate.offset > matchPosition) break;
    anchor = candidate.id;
  }
  return anchor;
}

function getResultUrl(
  result: StoredSearchResult,
  highlightTerms: string[],
  lang: Lang,
): string {
  if (result.kind !== "post" || highlightTerms.length === 0) {
    return result.url;
  }

  const url = new URL(result.url, window.location.origin);
  for (const term of highlightTerms) {
    url.searchParams.append("highlight", term);
  }

  const matchedField = getMatchedField(result);
  if (!matchedField) {
    url.hash = result.rootAnchor;
  } else {
    const source = result[matchedField];
    const anchors =
      matchedField === "body" ? result.bodyAnchors : result.codeAnchors;
    url.hash = getClosestAnchor(
      anchors,
      getMatchPosition(source, highlightTerms, lang),
      result.rootAnchor,
    );
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function appendHighlightedText(
  target: HTMLElement,
  text: string,
  terms: string[],
): void {
  const escapedTerms = [...new Set(terms)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escapedTerms.length === 0) {
    target.textContent = text;
    return;
  }

  const pattern = new RegExp(`(${escapedTerms.join("|")})`, "giu");
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    target.append(document.createTextNode(text.slice(lastIndex, index)));
    const mark = document.createElement("mark");
    mark.textContent = match[0];
    target.append(mark);
    lastIndex = index + match[0].length;
  }
  target.append(document.createTextNode(text.slice(lastIndex)));
}

function readLabels(root: HTMLElement): SearchLabels {
  return {
    results: root.dataset.labelResults ?? "{count}",
    resultsLimited: root.dataset.labelResultsLimited ?? "{shown}/{count}",
    empty: root.dataset.labelEmpty ?? "",
    error: root.dataset.labelError ?? "",
    post: root.dataset.labelPost ?? "Post",
    moment: root.dataset.labelMoment ?? "Moment",
  };
}

async function initializeSearch(root: HTMLElement): Promise<void> {
  if (initialized.has(root)) return;
  initialized.add(root);

  const lang = root.dataset.lang as Lang;
  const indexUrl = root.dataset.indexUrl;
  const maxResults = Number(root.dataset.maxResults) || 30;
  const labels = readLabels(root);
  const form = requiredElement<HTMLFormElement>(root, "[data-search-form]");
  const queryInput = requiredElement<HTMLInputElement>(
    root,
    "[data-search-query]",
  );
  const tagControl = requiredElement<HTMLElement>(
    root,
    "[data-search-tag-control]",
  );
  const tagInput = requiredElement<HTMLInputElement>(root, "[data-search-tag]");
  const tagButton = requiredElement<HTMLButtonElement>(
    root,
    "[data-search-tag-button]",
  );
  const tagValue = requiredElement<HTMLElement>(
    root,
    "[data-search-tag-value]",
  );
  const tagList = requiredElement<HTMLElement>(
    root,
    "[data-search-tag-list]",
  );
  const status = requiredElement<HTMLElement>(root, "[data-search-status]");
  const resultList = requiredElement<HTMLOListElement>(
    root,
    "[data-search-results]",
  );
  const resultTemplate = requiredElement<HTMLTemplateElement>(
    root,
    "[data-search-result-template]",
  );
  const resultTagTemplate = requiredElement<HTMLTemplateElement>(
    root,
    "[data-search-tag-template]",
  );
  const tagOptionTemplate = requiredElement<HTMLTemplateElement>(
    root,
    "[data-search-tag-option-template]",
  );

  const getTagOptions = () =>
    Array.from(
      tagList.querySelectorAll<HTMLButtonElement>("[data-search-tag-option]"),
    );

  const updateTagSelection = () => {
    const options = getTagOptions();
    const selectedOption = options.find(
      (option) => option.dataset.value === tagInput.value,
    );
    const selectedLabel = selectedOption?.querySelector<HTMLElement>(
      "[data-search-tag-option-label]",
    );
    tagValue.textContent = selectedLabel?.textContent?.trim() ?? tagInput.value;
    for (const option of options) {
      option.setAttribute(
        "aria-selected",
        String(option.dataset.value === tagInput.value),
      );
    }
  };

  const isTagMenuOpen = () => !tagList.hidden;
  const setTagMenuOpen = (open: boolean, focusSelected = false) => {
    tagList.hidden = !open;
    tagButton.setAttribute("aria-expanded", String(open));
    if (!open || !focusSelected) return;

    const options = getTagOptions();
    const selectedOption = options.find(
      (option) => option.dataset.value === tagInput.value,
    );
    (selectedOption ?? options[0])?.focus();
  };

  const readUrlState = () => {
    const parameters = new URLSearchParams(window.location.search);
    queryInput.value = parameters.get("q") ?? "";
    tagInput.value = parameters.get("tag") ?? "";
    updateTagSelection();
  };

  const writeUrlState = () => {
    const url = new URL(window.location.href);
    const query = queryInput.value.trim();
    const tag = tagInput.value;
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (tag) url.searchParams.set("tag", tag);
    else url.searchParams.delete("tag");
    window.history.replaceState(null, "", url);
  };

  readUrlState();

  try {
    if (!indexUrl) throw new Error("Missing search index URL");
    const response = await fetch(indexUrl);
    if (!response.ok) {
      throw new Error(`Search index request failed: ${response.status}`);
    }
    const index = await MiniSearch.loadJSONAsync<SearchDocument>(
      await response.text(),
      getSearchOptions(lang),
    );

    const allDocuments = index.search(
      MiniSearch.wildcard,
    ) as StoredSearchResult[];
    const tagCounts = new Map<string, number>();
    for (const document of allDocuments) {
      for (const tag of new Set(document.tags ?? [])) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    const collator = new Intl.Collator(lang);
    const tags = Array.from(tagCounts, ([tag, count]) => ({ tag, count })).sort(
      (a, b) => b.count - a.count || collator.compare(a.tag, b.tag),
    );
    const requestedTag = tagInput.value;
    if (requestedTag && !tagCounts.has(requestedTag)) {
      tags.push({ tag: requestedTag, count: 0 });
    }
    for (const { tag } of tags) {
      const item = tagOptionTemplate.content.firstElementChild?.cloneNode(
        true,
      ) as HTMLElement | undefined;
      if (!item) continue;

      const option = requiredElement<HTMLButtonElement>(
        item,
        "[data-search-tag-option]",
      );
      const optionLabel = requiredElement<HTMLElement>(
        option,
        "[data-search-tag-option-label]",
      );
      option.dataset.value = tag;
      option.title = tag;
      optionLabel.textContent = tag;
      tagList.append(item);
    }
    tagButton.disabled = false;
    readUrlState();
    root.setAttribute("aria-busy", "false");

    const render = () => {
      const query = queryInput.value.trim();
      const tag = tagInput.value;
      resultList.replaceChildren();

      if (!query && !tag) {
        status.textContent = "";
        return;
      }

      const filter = tag
        ? (result: SearchResult) =>
            Array.isArray(result.tags) && result.tags.includes(tag)
        : undefined;
      const results = (
        query
          ? index.search(query, { filter })
          : index.search(MiniSearch.wildcard, { filter })
      ) as StoredSearchResult[];
      results.sort(
        (a, b) =>
          b.score - a.score ||
          b.date.localeCompare(a.date) ||
          a.title.localeCompare(b.title, lang),
      );

      const visibleResults = results.slice(0, maxResults);
      status.textContent =
        results.length === 0
          ? labels.empty
          : results.length > visibleResults.length
            ? fillLabel(labels.resultsLimited, {
                shown: visibleResults.length,
                count: results.length,
              })
            : fillLabel(labels.results, { count: results.length });

      const fragment = document.createDocumentFragment();
      for (const result of visibleResults) {
        const item = resultTemplate.content.firstElementChild?.cloneNode(
          true,
        ) as HTMLElement | undefined;
        if (!item) continue;
        const highlightTerms = query
          ? getHighlightTerms(result, query, lang)
          : [];

        const title = requiredElement<HTMLAnchorElement>(
          item,
          "[data-result-title]",
        );
        title.href = getResultUrl(result, highlightTerms, lang);
        title.textContent = result.title;

        const kind = requiredElement<HTMLElement>(item, "[data-result-kind]");
        kind.textContent = result.kind === "post" ? labels.post : labels.moment;

        const date = requiredElement<HTMLTimeElement>(item, "[data-result-date]");
        date.dateTime = result.date;
        date.textContent = result.date;
        date.hidden = !result.date;

        const excerpt = requiredElement<HTMLElement>(
          item,
          "[data-result-excerpt]",
        );
        appendHighlightedText(
          excerpt,
          getSnippet(result, highlightTerms, lang),
          highlightTerms,
        );
        excerpt.hidden = !excerpt.textContent;

        const tagList = requiredElement<HTMLElement>(item, "[data-result-tags]");
        for (const resultTag of result.tags ?? []) {
          const tagElement =
            resultTagTemplate.content.firstElementChild?.cloneNode(
              true,
            ) as HTMLElement | undefined;
          if (!tagElement) continue;
          tagElement.textContent = resultTag;
          tagList.append(tagElement);
        }

        fragment.append(item);
      }
      resultList.append(fragment);
    };

    let inputTimer: ReturnType<typeof setTimeout> | undefined;
    queryInput.addEventListener("input", () => {
      window.clearTimeout(inputTimer);
      inputTimer = window.setTimeout(() => {
        writeUrlState();
        render();
      }, 120);
    });

    const selectTag = (tag: string) => {
      tagInput.value = tag;
      updateTagSelection();
      writeUrlState();
      render();
      setTagMenuOpen(false);
      tagButton.focus();
    };

    tagButton.addEventListener("click", () => {
      setTagMenuOpen(!isTagMenuOpen(), true);
    });
    tagButton.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      setTagMenuOpen(true, true);
    });
    tagList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const option = target.closest<HTMLButtonElement>(
        "[data-search-tag-option]",
      );
      if (!option || !tagList.contains(option)) return;
      selectTag(option.dataset.value ?? "");
    });
    tagList.addEventListener("keydown", (event) => {
      const options = getTagOptions();
      const currentIndex = options.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      let nextIndex: number | undefined;

      if (event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % options.length;
      } else if (event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + options.length) % options.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = options.length - 1;
      } else if (event.key === "Escape") {
        event.preventDefault();
        setTagMenuOpen(false);
        tagButton.focus();
        return;
      }

      if (nextIndex === undefined) return;
      event.preventDefault();
      options[nextIndex]?.focus();
    });
    dismissWhenInactive({
      root: tagControl,
      isOpen: isTagMenuOpen,
      close: () => setTagMenuOpen(false),
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.clearTimeout(inputTimer);
      writeUrlState();
      render();
    });
    window.addEventListener("popstate", () => {
      readUrlState();
      setTagMenuOpen(false);
      render();
    });

    render();
  } catch (error) {
    console.error(error);
    root.setAttribute("aria-busy", "false");
    status.textContent = labels.error;
  }
}

document.querySelectorAll<HTMLElement>("[data-search-root]").forEach((root) => {
  void initializeSearch(root);
});
