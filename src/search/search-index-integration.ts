import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse, type HTMLElement } from "node-html-parser";
import { type AstroIntegration } from "astro";
import {
  createSearchIndex,
  type SearchAnchor,
  type SearchDocument,
} from "./search-core";
import type { Lang } from "@/i18n/ui";

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

function normalizeMultilineText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstParagraph(body: HTMLElement): string {
  const clean = parse(body.innerHTML);
  for (const selector of EXCLUDED_BODY_SELECTORS) {
    clean.querySelectorAll(selector).forEach((node) => node.remove());
  }
  return normalizeText(clean.querySelector("p")?.structuredText ?? "");
}

type ExtractedText = {
  text: string;
  anchors: SearchAnchor[];
};

function getElementId(element: HTMLElement): string | null {
  return element.getAttribute("id") || null;
}

function extractCodeBlock(pre: HTMLElement): string {
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
  return normalizeMultilineText(
    lines.length > 0
      ? lines.map((line) => line.text).join("\n")
      : clean.structuredText,
  );
}

function extractCode(body: HTMLElement): ExtractedText {
  const chunks: string[] = [];
  const anchors: SearchAnchor[] = [];
  let currentAnchor: string | null = null;
  let currentLabel = "";
  let offset = 0;

  for (const element of body.querySelectorAll<HTMLElement>(
    "h2[id], h3[id], h4[id], h5[id], h6[id], pre",
  )) {
    if (element.tagName !== "PRE") {
      currentAnchor = getElementId(element);
      currentLabel = normalizeText(element.structuredText);
      continue;
    }

    const code = extractCodeBlock(element);
    if (!code) continue;
    if (chunks.length > 0) offset += 2;
    if (currentAnchor && anchors.at(-1)?.id !== currentAnchor) {
      anchors.push({ id: currentAnchor, label: currentLabel, offset });
    }
    chunks.push(code);
    offset += code.length;
  }

  return { text: chunks.join("\n\n"), anchors };
}

function extractBody(body: HTMLElement): ExtractedText {
  const clean = parse(body.innerHTML);
  for (const selector of EXCLUDED_BODY_SELECTORS) {
    clean.querySelectorAll(selector).forEach((node) => node.remove());
  }

  const markedAnchors = clean
    .querySelectorAll<HTMLElement>("h2[id], h3[id], h4[id], h5[id], h6[id]")
    .flatMap((heading, index) => {
      const id = getElementId(heading);
      if (!id) return [];

      const marker = `__OHEO_SEARCH_ANCHOR_${index}__`;
      const label = normalizeText(heading.structuredText);
      heading.innerHTML = marker + heading.innerHTML;
      return [{ id, label, marker }];
    });
  const markedText = normalizeText(clean.structuredText);
  const anchors: SearchAnchor[] = [];
  let text = "";
  let cursor = 0;
  for (const { id, label, marker } of markedAnchors) {
    const markerOffset = markedText.indexOf(marker, cursor);
    if (markerOffset < 0) continue;

    text += markedText.slice(cursor, markerOffset);
    anchors.push({ id, label, offset: text.length });
    cursor = markerOffset + marker.length;
  }
  text += markedText.slice(cursor);

  return { text, anchors };
}

function extractDisplayContent(body: HTMLElement): string {
  const clean = parse(body.innerHTML);
  for (const selector of EXCLUDED_BODY_SELECTORS.filter((selector) => selector !== ".expressive-code" && selector !== "pre")) {
    clean.querySelectorAll(selector).forEach((node) => node.remove());
  }
  for (const pre of clean.querySelectorAll<HTMLElement>("pre")) {
    pre.textContent = extractCodeBlock(pre);
  }
  return normalizeMultilineText(clean.structuredText);
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
  const title = element.getAttribute("data-search-title") ?? "";

  if (
    !body ||
    !lang ||
    !LANGS.includes(lang) ||
    (kind !== "post" && kind !== "moment") ||
    !id ||
    !url
  ) {
    return null;
  }

  const extractedBody = extractBody(body);
  const extractedCode = extractCode(body);
  const displayContent = extractDisplayContent(body);

  return {
    id,
    kind,
    lang,
    url,
    rootAnchor: element.getAttribute("data-search-root-anchor") ?? "",
    title,
    displayTitle:
      element.getAttribute("data-search-display-title") ?? title,
    description: normalizeText(
      element.getAttribute("data-search-description") ?? "",
    ),
    firstParagraph: firstParagraph(body),
    displayContent,
    body: extractedBody.text,
    bodyAnchors: extractedBody.anchors,
    code: extractedCode.text,
    codeAnchors: extractedCode.anchors,
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
