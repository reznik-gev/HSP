/** A catalog item's flags as small badges (docs/0021): Built-in, Seat, Mountable, Attaches to…,
 *  Takes floor space. */
import { useTranslation } from "react-i18next";

import { type CatalogItem, categoryName } from "./data";

export function FlagBadges({
  rev,
  builtin,
}: {
  rev: CatalogItem["current_revision"];
  builtin: boolean;
}) {
  const { t, i18n } = useTranslation();
  const list = new Intl.ListFormat(i18n.resolvedLanguage, { type: "disjunction" });
  const badges = [
    builtin && t("catalog.badges.builtin"),
    rev.is_seat && t("catalog.badges.seat"),
    rev.mountable && t("catalog.badges.mountable"),
    rev.attaches_to_categories.length > 0 &&
      t("catalog.badges.attaches", {
        to: list.format(rev.attaches_to_categories.map((c) => categoryName(t, c))),
      }),
    rev.footprint_blocks && t("catalog.badges.blocks"),
  ].filter((b): b is string => Boolean(b));
  return (
    <ul className="flex flex-wrap justify-end gap-1">
      {badges.map((b) => (
        <li key={b} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {b}
        </li>
      ))}
    </ul>
  );
}
