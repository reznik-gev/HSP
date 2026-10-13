/** The People page's address parameters: filters and the open person (docs/0088). */
export interface PeopleSearch {
  q?: string;
  unit?: string;
  inactive?: boolean;
  unseated?: boolean;
  person?: string;
  new?: boolean;
}

export function validatePeopleSearch(s: Record<string, unknown>): PeopleSearch {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const flag = (v: unknown) => (v === true || v === "true" ? true : undefined);
  return {
    q: str(s.q),
    unit: str(s.unit),
    inactive: flag(s.inactive),
    unseated: flag(s.unseated),
    person: str(s.person),
    new: flag(s.new),
  };
}
