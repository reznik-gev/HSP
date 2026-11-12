/** The guide's small Markdown (docs/0146), and that both languages tell the same guide. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type Block, parse, slug } from "./markdown";

describe("parse", () => {
  it("reads headings, paragraphs, tips, lists and GIFs", () => {
    const blocks = parse(
      [
        "## Find a seat",
        "Type a name\nand press `Enter`.",
        "> A tip.",
        "- one\n- two\n  goes on",
        "1. first\n2. second",
        "![Finding a seat](find.gif)",
        "### Smaller",
      ].join("\n\n"),
      "everyone-",
    );
    expect(blocks).toEqual<Block[]>([
      { kind: "heading", level: 2, text: "Find a seat", id: "everyone-find-a-seat" },
      { kind: "paragraph", text: "Type a name and press `Enter`." },
      { kind: "tip", text: "A tip." },
      { kind: "list", ordered: false, items: ["one", "two goes on"] },
      { kind: "list", ordered: true, items: ["first", "second"] },
      { kind: "image", alt: "Finding a seat", src: "find.gif" },
      { kind: "heading", level: 3, text: "Smaller", id: "everyone-smaller" },
    ]);
  });

  it("keeps Hebrew letters in heading ids", () => {
    expect(slug("1. אתרים, בניינים וקומות")).toBe("1-אתרים-בניינים-וקומות");
  });
});

/** Every guide page, in each language. */
const DIR = join(__dirname);
const LANGS = ["en", "he"] as const;
const PAGES = readdirSync(join(DIR, "en")).filter((f) => f.endsWith(".md"));
const read = (lang: string, page: string) => parse(readFileSync(join(DIR, lang, page), "utf8"));
const shape = (blocks: Block[]) =>
  blocks.map((b) =>
    b.kind === "image" ? `image ${b.src}` : b.kind === "list" ? `list ${b.items.length}` : b.kind,
  );

describe("the guide", () => {
  it.each(PAGES)("%s has the same sections, lists and GIFs in English and Hebrew", (page) => {
    expect(shape(read("he", page))).toEqual(shape(read("en", page)));
  });

  it("shows only GIFs that exist, recorded in the page's own language", () => {
    for (const lang of LANGS) {
      const gifs = new Set(readdirSync(join(DIR, "media", lang)));
      for (const page of PAGES)
        for (const b of read(lang, page))
          if (b.kind === "image") expect(gifs, `${lang}/${page}`).toContain(b.src);
    }
  });

  it("uses only the Markdown the renderer knows: no HTML, no outside links", () => {
    for (const lang of LANGS)
      for (const page of PAGES) {
        const text = readFileSync(join(DIR, lang, page), "utf8");
        expect(text, `${lang}/${page}`).not.toMatch(/<[a-z]/i);
        expect(text, `${lang}/${page}`).not.toMatch(/\]\((?!\/|#)[^)]*\)(?<!\.gif\))/);
      }
  });
});
