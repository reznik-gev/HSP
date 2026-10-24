/** The sizing bench's office: who sits where, shared by its seed and its load. */

export const PEOPLE = Number(process.env.HSP_SIZING_PEOPLE ?? 1000);
export const DESKS_PER_FLOOR = 500;
export const DESKS_PER_ROW = 25;

/** Person n (from 1) sits at desk n: floor 1 holds desks 1–500, floor 2 the next 500, and so on. */
export function seatOf(n: number) {
  const floor = Math.floor((n - 1) / DESKS_PER_FLOOR) + 1;
  const desk = ((n - 1) % DESKS_PER_FLOOR) + 1;
  return {
    person: `Person ${n}`,
    email: `person.${n}@sizing.example`,
    floor: `Floor ${floor}`,
    label: `${floor}-${String(desk).padStart(3, "0")}`,
  };
}
