/**
 * Import templates (docs/0088 choice 7): a CSV with the expected columns and one example row,
 * generated in the browser. UTF-8 with a byte-order mark, so Excel opens Hebrew correctly.
 * Columns follow docs/0084 (teams, people) and docs/0085 (seat assignments).
 */
export const IMPORT_KINDS = ["units", "people", "seats"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const TEMPLATES: Record<ImportKind, { file: string; rows: string[][] }> = {
  units: {
    file: "teams.csv",
    rows: [
      ["external_id", "name", "parent_external_id", "level_label"],
      ["ACME", "Acme", "", "Company"],
      ["RND", "R&D", "ACME", "Division"],
    ],
  },
  people: {
    file: "people.csv",
    rows: [
      [
        "email",
        "display_name",
        "external_id",
        "title",
        "primary_unit_external_id",
        "secondary_unit_external_ids",
        "position",
      ],
      ["dana@example.com", "Dana Cohen", "E1001", "Engineer", "RND", "", "Team Lead"],
    ],
  },
  seats: {
    file: "seat-assignments.csv",
    rows: [
      ["seat_label", "building_code", "holder_email", "holder_unit_external_id", "note"],
      ["HT-3-01", "HT", "dana@example.com", "", ""],
    ],
  },
};

/** Byte-order mark: tells Excel the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

export function templateCsv(kind: ImportKind): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return BOM + TEMPLATES[kind].rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadTemplate(kind: ImportKind): void {
  const url = URL.createObjectURL(
    new Blob([templateCsv(kind)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = TEMPLATES[kind].file;
  a.click();
  URL.revokeObjectURL(url);
}
