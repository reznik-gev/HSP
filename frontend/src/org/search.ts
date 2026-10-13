/** The Teams page's address parameters: the open team, or a new one (docs/0088). */
export interface OrgSearch {
  unit?: string;
  new?: boolean;
  view?: "chart";
}

export function validateOrgSearch(s: Record<string, unknown>): OrgSearch {
  return {
    unit: typeof s.unit === "string" && s.unit ? s.unit : undefined,
    new: s.new === true || s.new === "true" ? true : undefined,
    view: s.view === "chart" ? "chart" : undefined,
  };
}
