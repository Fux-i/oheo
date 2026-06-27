import { type Lang } from "@/i18n/ui";

type SingleContent = {
  type: "single";
  source: string | Record<Lang, string>;
};

type CollectionContent = {
  type: "collection";
  source: Record<Lang, RegExp>;
};

type ContentEntry = SingleContent | CollectionContent;

/* config */

export const DATA_BASE = "/src/data";

export const CONTENT = {
  about: {
    type: "single",
    source: { zh: "about.md", en: "about.en.md" },
  },
  friends: {
    type: "single",
    source: "friends.md",
  },
  posts: {
    type: "collection",
    source: {
      zh: /^blog\/.*(?<!\.en)\.md$/,
      en: /^blog\/.*\.en\.md$/,
    },
  },
  moments: {
    type: "collection",
    source: {
      zh: /^diary\/.*(?<!\.en)\.md$/,
      en: /^diary\/.*\.en\.md$/,
    },
  },
} as const satisfies Record<string, ContentEntry>;

export type PageKey = keyof typeof CONTENT;

type FrontmatterAliases = Partial<Record<PageKey, Record<string, string>>>;

export const FRONTMATTER_ALIASES: FrontmatterAliases = {
  posts: {
    "zhihu-title": "title",
    "zhihu-updated-at": "updated-at",
    "zhihu-created-at": "published-at",
    "zhihu-content-created": "published-at",
    "content-created": "published-at",
  },
};

/* runtime */

export type MarkdownHeading = {
  depth: number;
  slug: string;
  text: string;
};

type MdModule = {
  frontmatter: Record<string, any>;
  Content: any;
  file?: string;
  url?: string;
  getHeadings?: () => MarkdownHeading[];
};

// import.meta.glob requires literal pattern; load every md under src/data
const modules = import.meta.glob<MdModule>("/src/data/**/*.md", {
  eager: true,
});

// strip "/src/data/" prefix → relative path key, e.g. "blog/a/b/c.md"
const entries: { path: string; mod: MdModule }[] = Object.entries(modules).map(
  ([abs, mod]) => ({
    path: abs.replace(DATA_BASE + "/", ""),
    mod,
  }),
);

function resolveSourceString(
  entry: ContentEntry,
  lang: Lang,
): string | null {
  if (entry.type !== "single") return null;
  if (typeof entry.source === "string") return entry.source;
  return entry.source[lang] ?? null;
}

function fallbackSlug(path: string): string {
  // strip first segment (source dir) and all trailing .xxx suffixes
  // e.g. "blog/a/b/c.en.md" → "a/b/c"
  const noSourceDir = path.includes("/")
    ? path.slice(path.indexOf("/") + 1)
    : path;
  const base = noSourceDir.split("/").pop()!;
  const stem = base.split(".")[0];
  const dir = noSourceDir.includes("/")
    ? noSourceDir.slice(0, noSourceDir.lastIndexOf("/"))
    : "";
  return dir ? `${dir}/${stem}` : stem;
}

function normalizeFrontmatter(
  pageKey: PageKey,
  frontmatter: Record<string, any> = {},
): Record<string, any> {
  const aliases = FRONTMATTER_ALIASES[pageKey];
  if (!aliases) return frontmatter;

  const normalized = { ...frontmatter };
  for (const [from, to] of Object.entries(aliases)) {
    if (normalized[to] === undefined && normalized[from] !== undefined) {
      normalized[to] = normalized[from];
    }
  }

  return normalized;
}

export function getSingle(pageKey: PageKey, lang: Lang): MdModule | null {
  const entry = CONTENT[pageKey];
  const src = resolveSourceString(entry, lang);
  if (!src) return null;
  const hit = entries.find((e) => e.path === src);
  if (!hit) return null;

  return {
    ...hit.mod,
    frontmatter: normalizeFrontmatter(pageKey, hit.mod.frontmatter),
  };
}

export type CollectionItem = {
  slug: string;
  frontmatter: Record<string, any>;
  Content: any;
  headings: MarkdownHeading[];
};

export function getCollection(
  pageKey: PageKey,
  lang: Lang,
): CollectionItem[] {
  const entry = CONTENT[pageKey];
  if (entry.type !== "collection") return [];
  const pattern = entry.source[lang];
  if (!pattern) return [];

  return entries
    .filter((e) => pattern.test(e.path))
    .filter((e) => e.mod.frontmatter?.draft !== true)
    .map((e) => {
      const frontmatter = normalizeFrontmatter(pageKey, e.mod.frontmatter);

      return {
        slug: frontmatter.slug ?? fallbackSlug(e.path),
        frontmatter,
        Content: e.mod.Content,
        headings: e.mod.getHeadings?.() ?? [],
      };
    });
}
