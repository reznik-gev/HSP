/**
 * The user guide's own small Markdown (docs/0146): just what the guide uses, turned into React
 * elements. No HTML is ever passed through, so a page can't inject anything.
 *
 *   ## Heading, ### Smaller heading   headings; `##` ones get an id and go in the contents
 *   - item, 1. item                   lists, one level
 *   > text                            a tip
 *   ![What it shows](name.gif)        a GIF, alone on its line, from guide/media/
 *   **bold**, `Ctrl+Z`, [text](/floors), [text](#heading-id)
 *                                     inline: bold, a key, a link inside HSP
 *
 * Blocks are separated by blank lines. Lines of one paragraph or list item are joined.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "tip"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "image"; alt: string; src: string };

/** An id for a heading, for links within the page: lower case, words joined by "-". Hebrew
 * letters are kept. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const BULLET = /^- /;
const NUMBER = /^\d+\. /;

/** Split a page into blocks. `idPrefix` keeps two pages' heading ids apart. */
export function parse(source: string, idPrefix = ""): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const first = lines[0];
    if (first === undefined) continue;
    const heading = /^(#{2,3}) (.+)$/.exec(first);
    const image = IMAGE.exec(first);
    if (heading && lines.length === 1) {
      const text = heading[2]!;
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 2 | 3,
        text,
        id: idPrefix + slug(text),
      });
    } else if (image && lines.length === 1) {
      blocks.push({ kind: "image", alt: image[1]!, src: image[2]! });
    } else if (first.startsWith("> ")) {
      blocks.push({ kind: "tip", text: lines.map((l) => l.replace(/^>\s?/, "")).join(" ") });
    } else if (BULLET.test(first) || NUMBER.test(first)) {
      const ordered = NUMBER.test(first);
      const marker = ordered ? NUMBER : BULLET;
      const items: string[] = [];
      for (const line of lines) {
        if (marker.test(line)) items.push(line.replace(marker, ""));
        else if (items.length) items[items.length - 1] += ` ${line}`;
      }
      blocks.push({ kind: "list", ordered, items });
    } else {
      blocks.push({ kind: "paragraph", text: lines.join(" ") });
    }
  }
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Bold, keys and links inside a line of text. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const key = out.length;
    const [, bold, code, label, href] = m;
    if (bold !== undefined) out.push(<strong key={key}>{bold}</strong>);
    else if (code !== undefined) out.push(<kbd key={key}>{code}</kbd>);
    else if (href!.startsWith("/")) {
      out.push(
        <Link key={key} to={href}>
          {label}
        </Link>,
      );
    } else if (href!.startsWith("#")) {
      out.push(
        <a key={key} href={href}>
          {label}
        </a>,
      );
    } else {
      // HSP runs offline, so the guide links nowhere outside it: the text stays, the link goes.
      out.push(label);
    }
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** A page of the guide. `media` maps a GIF's file name to its URL. */
export function GuideMarkdown({
  blocks,
  media,
}: {
  blocks: Block[];
  media: Record<string, string>;
}) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return b.level === 2 ? (
              <h2 key={i} id={b.id}>
                {b.text}
              </h2>
            ) : (
              <h3 key={i} id={b.id}>
                {b.text}
              </h3>
            );
          case "paragraph":
            return <p key={i}>{inline(b.text)}</p>;
          case "tip":
            return (
              <p key={i} className="guide-tip">
                {inline(b.text)}
              </p>
            );
          case "list": {
            const items = b.items.map((item, j) => <li key={j}>{inline(item)}</li>);
            return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }
          case "image": {
            const src = media[b.src];
            return src ? (
              <figure key={i}>
                <img src={src} alt={b.alt} loading="lazy" />
                <figcaption>{b.alt}</figcaption>
              </figure>
            ) : null;
          }
        }
      })}
    </>
  );
}
