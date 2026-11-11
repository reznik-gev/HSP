/**
 * The user guide (docs/0144, docs/0146): short pages of text with a few GIFs, inside HSP so it
 * works offline. One part for everyone, one for admins; viewers see only the first. Opened from
 * the user menu.
 */
import { useTranslation } from "react-i18next";

import { Page } from "@/app/Page";
import { useIsAdmin } from "@/auth/admin";
import type { Language } from "@/i18n";

import adminsEn from "./en/admins.md?raw";
import everyoneEn from "./en/everyone.md?raw";
import adminsHe from "./he/admins.md?raw";
import everyoneHe from "./he/everyone.md?raw";
import { type Block, GuideMarkdown, parse } from "./markdown";

const PAGES: Record<Language, { everyone: Block[]; admins: Block[] }> = {
  en: { everyone: parse(everyoneEn, "everyone-"), admins: parse(adminsEn, "admins-") },
  he: { everyone: parse(everyoneHe, "everyone-"), admins: parse(adminsHe, "admins-") },
};

/** The GIFs, by file name. Recorded once, in English; both languages show them (docs/0144). */
const MEDIA: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("./media/*.gif", { eager: true, query: "?url", import: "default" }),
  ).map(([path, url]) => [path.slice("./media/".length), url]),
);

const PROSE = [
  "max-w-prose leading-relaxed",
  "[&_h2]:mt-10 [&_h2]:scroll-mt-4 [&_h2]:text-lg [&_h2]:font-semibold",
  "[&_h3]:mt-6 [&_h3]:font-semibold",
  "[&_p]:mt-3 [&_ul]:mt-3 [&_ol]:mt-3 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ms-5 [&_li]:mt-1",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_kbd]:rounded [&_kbd]:border [&_kbd]:bg-muted [&_kbd]:px-1.5 [&_kbd]:py-0.5 [&_kbd]:text-xs",
  "[&_.guide-tip]:rounded-md [&_.guide-tip]:border [&_.guide-tip]:bg-card [&_.guide-tip]:px-4 [&_.guide-tip]:py-3",
  "[&_figure]:mt-4 [&_img]:rounded-md [&_img]:border",
  "[&_figcaption]:mt-1 [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground",
].join(" ");

export function GuidePage() {
  const { t, i18n } = useTranslation();
  const isAdmin = useIsAdmin();
  const pages = PAGES[i18n.resolvedLanguage === "he" ? "he" : "en"];
  const parts = [
    { id: "everyone", title: t("guide.everyone"), blocks: pages.everyone },
    ...(isAdmin ? [{ id: "admins", title: t("guide.admins"), blocks: pages.admins }] : []),
  ];

  return (
    <Page title={t("guide.title")}>
      <nav aria-label={t("guide.contents")} className="max-w-prose rounded-md border bg-card p-4">
        {parts.map((part) => (
          <div key={part.id} className="not-first:mt-3">
            <div className="font-medium">
              <a href={`#${part.id}`} className="hover:underline">
                {part.title}
              </a>
            </div>
            <ul className="mt-1 grid gap-0.5 text-muted-foreground">
              {part.blocks.flatMap((b) =>
                b.kind === "heading" && b.level === 2
                  ? [
                      <li key={b.id}>
                        <a href={`#${b.id}`} className="hover:text-foreground hover:underline">
                          {b.text}
                        </a>
                      </li>,
                    ]
                  : [],
              )}
            </ul>
          </div>
        ))}
      </nav>
      {parts.map((part) => (
        <section key={part.id} aria-labelledby={part.id} className={PROSE}>
          <h2 id={part.id} className="!mt-12 border-b pb-2 !text-xl">
            {part.title}
          </h2>
          <GuideMarkdown blocks={part.blocks} media={MEDIA} />
        </section>
      ))}
    </Page>
  );
}
