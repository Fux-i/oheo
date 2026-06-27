import { type CollectionItem } from "@/content";

const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/;

export function getMomentDate(item: CollectionItem): string {
  return String(
    item.frontmatter.date ?? item.slug.match(DATE_PATTERN)?.[1] ?? item.slug,
  );
}

export function compareMoments(a: CollectionItem, b: CollectionItem): number {
  return getMomentDate(b).localeCompare(getMomentDate(a));
}
