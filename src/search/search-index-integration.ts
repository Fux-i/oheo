import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse, type HTMLElement } from "node-html-parser";
import { type AstroIntegration } from "astro";
import { createSearchIndex, type SearchDocument } from "./search-core";
import { type Lang } from "../i18n/ui";

const LANGS: Lang[] = ["en", "zh"];
const EXCLUDED_BODY_SELECTORS = [
  "[data-search-exclude]",
  ".expressive-code",
  ".katex-mathml",
  "pre",
  "button",
  "script",
  "style",
  "svg",
  "template",
];
const EXCLUDED_CODE_SELECTORS = [
  "button",
  ".gutter",
  ".line-number",
  "[data-line-number]",
];

async function findHtmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findHtmlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
    }),
  );

  return files.flat();
}

function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCode(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCode(body: HTMLElement): string {
  return normalizeCode(
    body
      .querySelectorAll("pre")
      .map((pre) => {
        const source = pre.querySelector("code") ?? pre;
        const clean = parse(source.innerHTML);
        for (const selector of EXCLUDED_CODE_SELECTORS) {
          clean.querySelectorAll(selector).forEach((node) => node.remove());
        }

        const expressiveCodeLines = clean.querySelectorAll(".ec-line");
        const lines =
          expressiveCodeLines.length > 0
            ? expressiveCodeLines
            : clean.querySelectorAll(".line");
        return lines.length > 0
          ? lines.map((line) => line.text).join("\n")
          : clean.structuredText;
      })
      .join("\n\n"),
  );
}

function extractBody(body: HTMLElement): string {
  const clean = parse(body.innerHTML);
  for (const selector of EXCLUDED_BODY_SELECTORS) {
    clean.querySelectorAll(selector).forEach((node) => node.remove());
  }
  return normalizeText(clean.structuredText);
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function readDocument(element: HTMLElement): SearchDocument | null {
  const body = element.querySelector("[data-search-body]");
  const lang = element.getAttribute("data-search-lang") as Lang | undefined;
  const kind = element.getAttribute("data-search-kind");
  const id = element.getAttribute("data-search-id");
  const url = element.getAttribute("data-search-url");
  const title = element.getAttribute("data-search-title");

  if (
    !body ||
    !lang ||
    !LANGS.includes(lang) ||
    (kind !== "post" && kind !== "moment") ||
    !id ||
    !url ||
    !title
  ) {
    return null;
  }

  return {
    id,
    kind,
    lang,
    url,
    title,
    body: extractBody(body),
    code: extractCode(body),
    date: element.getAttribute("data-search-date") ?? "",
    tags: parseTags(element.getAttribute("data-search-tags")),
  };
}

export default function searchIndexIntegration(): AstroIntegration {
  return {
    name: "oheo-search-index",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outputDirectory = fileURLToPath(dir);
        const documents = new Map<Lang, SearchDocument[]>(
          LANGS.map((lang) => [lang, []]),
        );

        for (const file of await findHtmlFiles(outputDirectory)) {
          const root = parse(await readFile(file, "utf8"));
          for (const element of root.querySelectorAll("[data-search-document]")) {
            const document = readDocument(element);
            if (document) documents.get(document.lang)?.push(document);
          }
        }

        const indexDirectory = path.join(outputDirectory, "search-index");
        await mkdir(indexDirectory, { recursive: true });

        for (const lang of LANGS) {
          const langDocuments = documents.get(lang) ?? [];
          const index = createSearchIndex(lang);
          index.addAll(langDocuments);
          await writeFile(
            path.join(indexDirectory, `${lang}.json`),
            JSON.stringify(index),
          );
          logger.info(`Indexed ${langDocuments.length} ${lang} search documents.`);
        }
      },
    },
  };
}
