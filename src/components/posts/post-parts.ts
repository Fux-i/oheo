import { type CollectionItem } from "@/content";

export function getPostPublishedTime(item: CollectionItem): string {
  return item.frontmatter["published-at"] ?? "";
}

export function comparePosts(a: CollectionItem, b: CollectionItem): number {
  const byPublishedTime = getPostPublishedTime(b).localeCompare(
    getPostPublishedTime(a),
  );

  return byPublishedTime || a.slug.localeCompare(b.slug);
}
