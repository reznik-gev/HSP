/** The Devices page's address parameters (docs/0095): search, filters and the open device. */
type YesNo = "yes" | "no";

export interface DevicesSearch {
  q?: string;
  placed?: YesNo;
  issued?: YesNo;
  device?: string;
  new?: boolean;
}

export function validateDevicesSearch(s: Record<string, unknown>): DevicesSearch {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const yesNo = (v: unknown) => (v === "yes" || v === "no" ? v : undefined);
  return {
    q: str(s.q),
    placed: yesNo(s.placed),
    issued: yesNo(s.issued),
    device: str(s.device),
    new: s.new === true || s.new === "true" ? true : undefined,
  };
}

/** A yes/no filter as the API takes it. */
export const asFlag = (v: YesNo | undefined) => (v ? v === "yes" : undefined);
