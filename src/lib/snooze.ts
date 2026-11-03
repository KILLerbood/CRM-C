/** «Not now»: hide a feed row until a moment. Local to this device (no server field needed), with undo. */
export type SnoozeMap = Record<string, number>;

export const isSnoozed = (m: SnoozeMap, key: string, now: number) => (m[key] ?? 0) > now;

/** Drop entries that have expired, so the stored map never grows. */
export function pruneSnoozes(m: SnoozeMap, now: number): SnoozeMap {
  const out: SnoozeMap = {};
  for (const [k, until] of Object.entries(m)) if (until > now) out[k] = until;
  return out;
}

export type SnoozeChoice = 'hours' | 'tomorrow' | 'week';
/** The moment a snooze ends. «tomorrow» = 9:00 Riyadh the next day (06:00 UTC), «week» = 9:00 Riyadh in 7 days. */
export function snoozeUntil(choice: SnoozeChoice, now: number): number {
  if (choice === 'hours') return now + 3 * 3600e3;
  const days = choice === 'tomorrow' ? 1 : 7;
  const d = new Date(now + 3 * 3600e3); // Riyadh wall clock
  d.setUTCHours(9, 0, 0, 0);
  return d.getTime() - 3 * 3600e3 + days * 864e5;
}
