// src/lib/format-date.ts
//
// ONE date-only display policy for the whole site (docs/2026-refresh.md §5).
//
// Two defects this exists to prevent:
//
//  1. The list printed the raw `2025-08-31` while the detail rendered
//     `new Date(frontmatter.date).toLocaleDateString(...)`. A date-only string parses
//     as UTC midnight, so west of UTC the detail showed the PREVIOUS calendar day.
//     Two surfaces, two answers, one source date.
//  2. A permissive parser: `2025-02-31` was formatted as "February 31" (a date that
//     does not exist), `2025-08-31garbage` was silently truncated to a date because the
//     pattern was unanchored, and an invalid `Date` object threw from `toISOString()`.
//
// THE POLICY, applied identically by both helpers:
//
//   accepted  — `YYYY-MM-DD` exactly, or `YYYY-MM-DD` followed by a valid ISO time
//               (`T`/space, HH:MM[:SS[.sss]][Z|±HH:MM]), or a valid Date object.
//               The calendar day is validated: month 1-12, day within that month
//               (proleptic Gregorian leap rule, so years 0000-0099 are handled rather
//               than mapped to 1900-1999), and any offset must be within ±23:59.
//   rejected  — anything else. Impossible dates, trailing characters, out-of-range
//               times and invalid Date objects are NOT prettified. A string that does
//               not parse is returned unchanged, so the authored text is preserved
//               rather than replaced by a plausible-looking invention; an invalid
//               Date object yields "" because there is no authored text to keep.
//
// Formatting is UTC-based so the rendered day equals the authored day in every time
// zone. `isoDateOnly` returns undefined for anything rejected.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Anchored: the whole string must be a date, optionally followed by a valid time and
 * offset. The previous unanchored prefix match is what let `2025-08-31garbage` through,
 * and an unvalidated offset is what let `2025-08-31T12:00+99:99` through.
 *
 * Groups: 1 year, 2 month, 3 day, 4 HH, 5 MM, 6 SS, 7 offset (Z or ±HH:MM), 8 offset
 * sign, 9 offset HH, 10 offset MM.
 */
const ISO_INPUT =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|([+-])(\d{2}):?(\d{2}))?)?$/;

export type DateParts = { year: number; month: number; day: number };

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Proleptic Gregorian leap rule. Valid for every year including 0000. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Length of a month in a specific year.
 *
 * Deliberately arithmetic rather than `Date.UTC(year, month, 0)`: `Date.UTC` maps years
 * 0-99 to 1900-1999, so `0000-02-29` was rejected (1900 is not a leap year) while the
 * proleptic calendar says year 0000 IS one. This has no such mapping.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1];
}

/**
 * Parse a date-only string or timestamp into calendar parts, or return null when the
 * input is not a real date. Exported so callers and tests can distinguish "no date"
 * from "a date that does not exist".
 */
export function parseDateParts(value: string | Date | null | undefined): DateParts | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const match = ISO_INPUT.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  if (match[4] !== undefined) {
    const hours = Number(match[4]);
    const minutes = Number(match[5]);
    const seconds = match[6] === undefined ? 0 : Number(match[6]);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;

    // A time may carry an offset; if it does, the offset itself must be valid. The
    // offset never shifts the rendered day (see the policy note at the top), so this is
    // a validity check on the authored input, not a conversion.
    if (match[8] !== undefined) {
      const offsetHours = Number(match[9]);
      const offsetMinutes = Number(match[10]);
      if (offsetHours > 23 || offsetMinutes > 59) return null;
    }
  }

  return { year, month, day };
}

/** True when the input is a real, correctly-formed date. */
export function isValidDateOnly(value: string | Date | null | undefined): boolean {
  return parseDateParts(value) !== null;
}

/** `Month DD, YYYY` for a real date; the authored text unchanged for anything else. */
export function formatDateOnly(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "";

  const parts = parseDateParts(value);
  if (parts) {
    // The year is padded to four digits for the same reason as isoDateOnly: an early
    // year must not render as "January 01, 1".
    return `${MONTHS[parts.month - 1]} ${String(parts.day).padStart(2, "0")}, ${String(parts.year).padStart(4, "0")}`;
  }

  // A Date object with no authored text has nothing honest to show.
  if (value instanceof Date) return "";

  // Keep the authored string: do not prettify an impossible date into a real-looking one.
  return String(value).trim();
}

/** `YYYY-MM-DD` for a `<time dateTime>` attribute, or undefined when invalid. */
export function isoDateOnly(value: string | Date | null | undefined): string | undefined {
  const parts = parseDateParts(value);
  if (!parts) return undefined;
  // The year is padded to four digits too: without it, `0001-01-01` emitted "1-01-01",
  // which is not a valid machine date.
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** `Mon YYYY` for a real date; date-only authored months never pass through a timezone. */
export function formatMonthYear(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "";

  const parts = parseDateParts(value);
  if (parts) {
    return `${SHORT_MONTHS[parts.month - 1]} ${String(parts.year).padStart(4, "0")}`;
  }

  if (value instanceof Date) return "";
  return String(value).trim();
}

function localCalendarParts(value: Date): DateParts {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

/** Calendar-month span for authored dates; an omitted end uses the local current date. */
export function calendarMonthDifference(
  startValue: string | Date | null | undefined,
  endValue?: string | Date | null,
  today = new Date(),
): number | null {
  const start = parseDateParts(startValue);
  const end = endValue === undefined ? localCalendarParts(today) : parseDateParts(endValue);
  if (!start || !end) return null;

  let months = (end.year - start.year) * 12 + (end.month - start.month);
  if (end.day < start.day) months -= 1;
  return months;
}
