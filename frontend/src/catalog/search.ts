/** The Catalog page's address parameters: search, which items, and the open item (docs/0095). */
export type CatalogShow = "builtin" | "custom" | "archived";

export interface CatalogSearch {
  q?: string;
  show?: CatalogShow;
  item?: string;
  new?: boolean;
}

export function validateCatalogSearch(s: Record<string, unknown>): CatalogSearch {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const show =
    s.show === "builtin" || s.show === "custom" || s.show === "archived" ? s.show : undefined;
  const fresh = s.new === true || s.new === "true" ? true : undefined;
  return { q: str(s.q), show, item: str(s.item), new: fresh };
}
