import MiniSearch from "minisearch";
import type { SearchResult } from "minisearch";
import { SITE } from "@/config";
import {
  getFuzzyEligibleTerms,
  getSearchOptions,
  tokenizeSearchText,
  type SearchAnchor,
  type SearchDocument,
} from "@/search/search-core";
import type { Lang } from "@/i18n/ui";

export type StoredSearchResult = SearchResult & Omit<SearchDocument, "id">;
export type SearchSort = "newest" | "oldest";
export type SearchPriority = "date" | "relevance";
export type SearchTier = "precise" | "approximate";

export type RankedSearchResult = StoredSearchResult & {
  tier: SearchTier;
  combinedScore: number;
};

export type SearchSnippet = {
  field: "body" | "code" | "display";
  text: string;
  anchorId: string;
  anchorLabel: string;
  start: number;
  end: number;
  trimmedStart: boolean;
  trimmedEnd: boolean;
};

export type SearchResultSets = {
  precise: StoredSearchResult[];
  approximate: StoredSearchResult[];
};

export type TagFacet = {
  tag: string;
  count: number;
};

export function fillLabel(
  label: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    label,
  );
}

export function readSearchSort(value: string | null): SearchSort {
  return value === "oldest" ? "oldest" : "newest";
}

export function writeSearchSort(url: URL, sort: SearchSort): void {
  if (sort === "oldest") url.searchParams.set("sort", "oldest");
  else url.searchParams.delete("sort");
}

export function readSearchPriority(value: string | null): SearchPriority {
  return value === "relevance" ? "relevance" : "date";
}

export function writeSearchPriority(url: URL, priority: SearchPriority): void {
  if (priority === "relevance") url.searchParams.set("rank", "relevance");
  else url.searchParams.delete("rank");
}

function getDateRank(
  results: StoredSearchResult[],
  sort: SearchSort,
): Map<string, number> {
  const dated = results
    .filter((result) => result.date)
    .map((result) => result.date)
    .sort((a, b) => a.localeCompare(b));
  const uniqueDates = [...new Set(dated)];
  const denominator = Math.max(1, uniqueDates.length - 1);
  const ranks = new Map<string, number>();

  for (const [index, date] of uniqueDates.entries()) {
    const newestRank = index / denominator;
    ranks.set(date, sort === "newest" ? newestRank : 1 - newestRank);
  }

  return ranks;
}

function dateCompare(
  left: StoredSearchResult,
  right: StoredSearchResult,
  sort: SearchSort,
): number {
  if (left.date && !right.date) return -1;
  if (!left.date && right.date) return 1;
  if (left.date !== right.date) {
    return sort === "newest"
      ? right.date.localeCompare(left.date)
      : left.date.localeCompare(right.date);
  }
  return 0;
}

export type SearchRankOptions = {
  sort: SearchSort;
  priority: SearchPriority;
  indexOrder?: ReadonlyMap<string, number>;
  dateBoost?: number;
};

export function rankSearchResults(
  sets: SearchResultSets,
  options: SearchRankOptions,
): RankedSearchResult[] {
  const { sort, priority, indexOrder, dateBoost = SITE.search.date_boost } = options;
  const all = [
    ...sets.precise.map((result) => ({ result, tier: "precise" as const })),
    ...sets.approximate.map((result) => ({ result, tier: "approximate" as const })),
  ];
  const rankByDate = getDateRank(all.map(({ result }) => result), sort);
  const tierRank = { precise: 0, approximate: 1 } as const;
  const fallbackOrder = new Map(all.map(({ result }, index) => [String(result.id), index]));
  const getIndexOrder = (result: StoredSearchResult): number =>
    indexOrder?.get(String(result.id)) ?? fallbackOrder.get(String(result.id)) ?? Number.MAX_SAFE_INTEGER;

  return all
    .map(({ result, tier }) => ({
      ...result,
      tier,
      combinedScore:
        result.score + (result.date ? dateBoost * (rankByDate.get(result.date) ?? 0) : 0),
    }))
    .sort((left, right) => {
      const tier = tierRank[left.tier] - tierRank[right.tier];
      if (tier !== 0) return tier;

      if (priority === "date") {
        return dateCompare(left, right, sort) || getIndexOrder(left) - getIndexOrder(right);
      }

      return (
        (left.date ? 0 : 1) - (right.date ? 0 : 1) ||
        right.combinedScore - left.combinedScore ||
        right.score - left.score ||
        dateCompare(left, right, sort) ||
        left.displayTitle.localeCompare(right.displayTitle) ||
        getIndexOrder(left) - getIndexOrder(right)
      );
    });
}

export function filterSearchResults(
  results: SearchResultSets,
  tag: string,
): SearchResultSets {
  if (!tag) return results;
  const matches = (result: StoredSearchResult) => result.tags.includes(tag);
  return {
    precise: results.precise.filter(matches),
    approximate: results.approximate.filter(matches),
  };
}

export function getTagFacets(results: SearchResultSets): TagFacet[] {
  const counts = new Map<string, number>();
  for (const result of [...results.precise, ...results.approximate]) {
    for (const tag of new Set(result.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const collator = new Intl.Collator();
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || collator.compare(left.tag, right.tag));
}

export function searchResultSets(
  index: MiniSearch<SearchDocument>,
  query: string,
  lang: Lang,
): SearchResultSets {
  if (!query) {
    return {
      precise: index.search(MiniSearch.wildcard) as StoredSearchResult[],
      approximate: [],
    };
  }

  const strict = index.search(query, { fuzzy: false }) as StoredSearchResult[];
  const strictIds = new Set(strict.map((result) => result.id));
  const fuzzy = index.search(
    query,
    getSearchOptions(lang, getFuzzyEligibleTerms(query, lang)).searchOptions,
  ) as StoredSearchResult[];

  return {
    precise: strict,
    approximate: fuzzy.filter((result) => !strictIds.has(result.id)),
  };
}

function editDistance(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  let previous = b.map((_, index) => index + 1);
  for (let row = 0; row < a.length; row += 1) {
    const current = [row + 1];
    for (let column = 0; column < b.length; column += 1) {
      current.push(
        Math.min(
          current[column] + 1,
          previous[column + 1] + 1,
          previous[column] + (a[row] === b[column] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous.at(-1) ?? a.length;
}

export function getHighlightTerms(
  result: StoredSearchResult,
  query: string,
  lang: Lang,
): string[] {
  const queryTerms = tokenizeSearchText(query, lang, true);
  const candidates = result.terms.length > 0 ? result.terms : queryTerms;
  return [...new Set(queryTerms.map((term) =>
    candidates.reduce((best, candidate) =>
      editDistance(term, candidate) < editDistance(term, best) ? candidate : best,
    ),
  ))];
}

function occurrences(source: string, terms: string[], lang: Lang): number[] {
  const normalized = source.toLocaleLowerCase(lang);
  const positions: number[] = [];
  for (const term of terms) {
    const normalizedTerm = term.toLocaleLowerCase(lang);
    let cursor = 0;
    while (normalizedTerm && cursor < normalized.length) {
      const position = normalized.indexOf(normalizedTerm, cursor);
      if (position < 0) break;
      positions.push(position);
      cursor = position + Math.max(1, normalizedTerm.length);
    }
  }
  return [...new Set(positions)].sort((a, b) => a - b);
}

function closestAnchor(
  anchors: SearchAnchor[],
  position: number,
): SearchAnchor | undefined {
  let closest: SearchAnchor | undefined;
  for (const anchor of anchors) {
    if (anchor.offset > position) break;
    closest = anchor;
  }
  return closest;
}

export function getSnippets(
  result: StoredSearchResult,
  terms: string[],
  lang: Lang,
  context = SITE.search.snippet_context,
  limit = SITE.search.max_snippets,
): SearchSnippet[] {
  if (result.kind === "moment") {
    return result.displayContent
      ? [{
          field: "display",
          text: result.displayContent,
          anchorId: result.rootAnchor,
          anchorLabel: "",
          start: 0,
          end: result.displayContent.length,
          trimmedStart: false,
          trimmedEnd: false,
        }]
      : [];
  }

  const fields = [
    { field: "body" as const, source: result.body, anchors: result.bodyAnchors },
    { field: "code" as const, source: result.code, anchors: result.codeAnchors },
  ];
  const windows = fields.flatMap(({ field, source, anchors }) => {
    const positions = occurrences(source, terms, lang);
    const merged: Array<{ start: number; end: number }> = [];
    for (const position of positions) {
      const next = {
        start: Math.max(0, position - context),
        end: Math.min(source.length, position + context),
      };
      const previous = merged.at(-1);
      if (previous && next.start <= previous.end) previous.end = Math.max(previous.end, next.end);
      else merged.push(next);
    }
    return merged.map((window) => {
      const anchor = closestAnchor(anchors, window.start);
      return {
        field,
        text: source.slice(window.start, window.end),
        anchorId: anchor?.id ?? result.rootAnchor,
        anchorLabel: anchor?.label ?? "",
        start: window.start,
        end: window.end,
        trimmedStart: window.start > 0,
        trimmedEnd: window.end < source.length,
      } satisfies SearchSnippet;
    });
  });

  return windows
    .sort((left, right) => left.start - right.start || (left.field === "body" ? -1 : 1))
    .slice(0, limit);
}

export function getFallbackExcerpt(result: StoredSearchResult): string {
  if (result.kind === "moment") return result.displayContent;
  return result.description || result.firstParagraph || result.body;
}
