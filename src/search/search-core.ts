import MiniSearch, { type Options, type SearchOptions } from "minisearch";
import { SITE } from "../config";
import { type Lang } from "../i18n/ui";

export type SearchDocumentKind = "post" | "moment";

export type SearchDocument = {
  id: string;
  kind: SearchDocumentKind;
  lang: Lang;
  url: string;
  title: string;
  body: string;
  code: string;
  date: string;
  tags: string[];
};

export const SEARCH_FIELDS = ["title", "body", "code"] as const;
export const SEARCH_STORE_FIELDS = [
  "kind",
  "lang",
  "url",
  "title",
  "body",
  "code",
  "date",
  "tags",
] as const;

const IDENTIFIER_PATTERN =
  /[\p{L}\p{N}@$#]+(?:[./:_-]+[\p{L}\p{N}@$#]+)+/gu;
const IDENTIFIER_SEPARATOR_PATTERN = /[./:_-]+/u;
const FALLBACK_WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const HAN_PATTERN = /\p{Script=Han}/u;
const HAN_SEQUENCE_PATTERN = /\p{Script=Han}+/gu;

function normalizeTerm(term: string, lang: Lang): string {
  return term.toLocaleLowerCase(lang);
}

export function tokenizeSearchText(
  text: string,
  lang: Lang,
  isQuery = false,
): string[] {
  const tokens = new Set<string>();
  const Segmenter = Intl.Segmenter;

  if (Segmenter) {
    const segmenter = new Segmenter(lang, { granularity: "word" });
    for (const segment of segmenter.segment(text)) {
      if (!segment.isWordLike) continue;
      const term = normalizeTerm(segment.segment, lang);
      if (!(isQuery && [...term].length === 1 && HAN_PATTERN.test(term))) {
        tokens.add(term);
      }
    }
  } else {
    for (const word of text.match(FALLBACK_WORD_PATTERN) ?? []) {
      tokens.add(normalizeTerm(word, lang));
    }
  }

  if (lang === "zh") {
    for (const sequence of text.match(HAN_SEQUENCE_PATTERN) ?? []) {
      const characters = [...sequence];
      if (!isQuery || characters.length === 1) {
        characters.forEach((character) => tokens.add(character));
      }
      for (let index = 0; index < characters.length - 1; index += 1) {
        tokens.add(characters[index] + characters[index + 1]);
      }
    }
  }

  for (const identifier of text.match(IDENTIFIER_PATTERN) ?? []) {
    tokens.add(normalizeTerm(identifier, lang));
    for (const part of identifier.split(IDENTIFIER_SEPARATOR_PATTERN)) {
      if (FALLBACK_WORD_PATTERN.test(part)) {
        tokens.add(normalizeTerm(part, lang));
      }
      FALLBACK_WORD_PATTERN.lastIndex = 0;
    }
  }

  return [...tokens];
}

function fuzzyDistance(term: string, lang: Lang): number | false {
  const length = [...term].length;
  if (length <= 1) return false;

  if (lang === "zh" && HAN_PATTERN.test(term) && length <= 4) return 1;
  return SITE.search.fuzzy_ratio;
}

export function getSearchOptions(lang: Lang): Options<SearchDocument> {
  const searchOptions: SearchOptions = {
    boost: SITE.search.weights,
    combineWith: "AND",
    prefix: true,
    fuzzy: (term) => fuzzyDistance(term, lang),
    maxFuzzy: 2,
  };

  return {
    fields: [...SEARCH_FIELDS],
    storeFields: [...SEARCH_STORE_FIELDS],
    tokenize: (text, fieldName) =>
      tokenizeSearchText(text, lang, fieldName === undefined),
    processTerm: (term) => normalizeTerm(term, lang),
    searchOptions,
  };
}

export function createSearchIndex(lang: Lang): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>(getSearchOptions(lang));
}
