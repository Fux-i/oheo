import { type CollectionItem } from "@/content";

const DATE_ONLY_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00\.000Z)?$/;

function normalizePostDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

export function formatPostDate(value: unknown): string {
  const normalized = normalizePostDate(value);
  return normalized.match(DATE_ONLY_PATTERN)?.[1] ?? normalized;
}

export function formatPostListDate(value: unknown): string {
  const formatted = formatPostDate(value);
  return formatted.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? formatted;
}

export function getPostPublishedTime(item: CollectionItem): string {
  const publishedAt = normalizePostDate(item.frontmatter["published-at"]);
  const date = publishedAt.match(DATE_ONLY_PATTERN)?.[1];

  return date ? `${date}T08:00:00` : publishedAt;
}

export function comparePosts(a: CollectionItem, b: CollectionItem): number {
  const byPublishedTime = getPostPublishedTime(b).localeCompare(
    getPostPublishedTime(a),
  );

  return byPublishedTime || a.slug.localeCompare(b.slug);
}
