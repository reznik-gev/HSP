/** The Catalog page's address parameters (docs/0095): the tab, search and which items, and
 *  the open item or zone type (`new` opens a new one in the current tab). */
export type CatalogShow = "builtin" | "custom" | "archived";

export interface CatalogSearch {
  tab?: "zones";
  q?: string;
  show?: CatalogShow;
  item?: string;
  zone?: string;
  new?: boolean;
}

export function validateCatalogSearch(s: Record<string, unknown>): CatalogSearch {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const show =
    s.show === "builtin" || s.show === "custom" || s.show === "archived" ? s.show : undefined;
  const fresh = s.new === true || s.new === "true" ? true : undefined;
  const tab = s.tab === "zones" ? s.tab : undefined;
  return { tab, q: str(s.q), show, item: str(s.item), zone: str(s.zone), new: fresh };
}
