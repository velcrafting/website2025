// tests/design/format-date.test.mjs
//
// Focused executable regression check for the shared date policy
// (src/lib/format-date.ts), required by CODEX_REFRESH_REVIEW.md finding 2.
//
// Covers: valid date-only input, impossible calendar dates, invalid Date objects,
// leap years, trailing characters, out-of-range times, and timezone consistency.
//
// Timezone consistency is proven by running this file under more than one TZ and
// requiring the SAME expected values — see the npm script and the receipt.
//
// Run: node --experimental-strip-types tests/design/format-date.test.mjs
import {
  formatDateOnly,
  formatMonthYear,
  calendarMonthDifference,
  isoDateOnly,
  isValidDateOnly,
  parseDateParts,
} from "../../src/lib/format-date.ts";

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const same =
    actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object"
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : Object.is(actual, expected);
  if (same) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}\n         expected: ${JSON.stringify(expected)}\n         actual:   ${JSON.stringify(actual)}`);
  }
}

console.log(`\nformat-date regression (TZ=${process.env.TZ ?? "(system)"})\n`);

// --- valid date-only -------------------------------------------------------
check("valid date-only formats as a human date", formatDateOnly("2025-08-31"), "August 31, 2025");
check("single-digit day is padded", formatDateOnly("2025-01-05"), "January 05, 2025");
check("the same date is stable across time zones", formatDateOnly("2025-08-31"), "August 31, 2025");
check("machine value is unshifted", isoDateOnly("2025-08-31"), "2025-08-31");

// --- authored calendar months ---------------------------------------------
check("date-only month formatting is timezone-stable", formatMonthYear("2024-07-01"), "Jul 2024");
check("calendar months use authored boundaries", calendarMonthDifference("2024-07-01", "2025-07-01"), 12);
check("calendar month spans respect the authored day", calendarMonthDifference("2024-07-15", "2024-08-01"), 0);
check("present spans use the local current calendar date", calendarMonthDifference("2024-07-01", undefined, new Date(2025, 6, 1)), 12);

// --- the reported defect: 2025-02-31 must not become a real date -----------
check("impossible day 31 February is rejected", isValidDateOnly("2025-02-31"), false);
check("impossible day 31 February is NOT prettified", formatDateOnly("2025-02-31"), "2025-02-31");
check("impossible day is not a machine value", isoDateOnly("2025-02-31"), undefined);

// --- month and day bounds --------------------------------------------------
check("month 13 is rejected", isValidDateOnly("2025-13-01"), false);
check("month 00 is rejected", isValidDateOnly("2025-00-10"), false);
check("day 00 is rejected", isValidDateOnly("2025-04-00"), false);
check("day 32 is rejected", isValidDateOnly("2025-01-32"), false);
check("April 31 is rejected (30-day month)", isValidDateOnly("2025-04-31"), false);
check("April 30 is accepted", isValidDateOnly("2025-04-30"), true);

// --- leap years ------------------------------------------------------------
check("leap day exists in 2024", isValidDateOnly("2024-02-29"), true);
check("leap day formats in 2024", formatDateOnly("2024-02-29"), "February 29, 2024");
check("leap day does not exist in 2025", isValidDateOnly("2025-02-29"), false);
check("leap day does not exist in 2100 (century rule)", isValidDateOnly("2100-02-29"), false);
check("leap day exists in 2000 (400-year rule)", isValidDateOnly("2000-02-29"), true);
check("February 28 is always valid", isValidDateOnly("2025-02-28"), true);

// --- trailing characters (the reported truncation) ------------------------
check("trailing garbage is rejected", isValidDateOnly("2025-08-31garbage"), false);
check("trailing garbage is not truncated to a date", isoDateOnly("2025-08-31garbage"), undefined);
check("trailing garbage is returned as authored", formatDateOnly("2025-08-31garbage"), "2025-08-31garbage");
check("a trailing dash is rejected", isValidDateOnly("2025-08-31-"), false);
check("leading text is rejected", isValidDateOnly("date: 2025-08-31"), false);

// --- timestamps ------------------------------------------------------------
check("a Z timestamp is accepted", isValidDateOnly("2025-08-31T12:00:00Z"), true);
check("a Z timestamp keeps the authored day", formatDateOnly("2025-08-31T23:30:00Z"), "August 31, 2025");
// POLICY: the calendar day is taken from the string AS AUTHORED. An offset does not
// shift it. A publication date is a calendar fact the author wrote, not an instant, so
// the displayed day must not depend on the reader's time zone or on the offset used.
check("an offset does not shift the authored day", formatDateOnly("2025-08-31T23:30:00-05:00"), "August 31, 2025");
check("an early-morning offset stays the authored day", formatDateOnly("2025-09-01T00:30:00+09:00"), "September 01, 2025");
check("a space separator is accepted", isValidDateOnly("2025-08-31 12:00"), true);
check("hour 24 is rejected", isValidDateOnly("2025-08-31T24:00:00Z"), false);
check("minute 60 is rejected", isValidDateOnly("2025-08-31T12:60:00Z"), false);
check("a bare time is rejected", isValidDateOnly("12:00:00"), false);

// --- offsets must themselves be valid (review counterexample) --------------
check("offset +99:99 is rejected", isValidDateOnly("2025-08-31T12:00+99:99"), false);
check("offset hour 99 is rejected", isValidDateOnly("2025-08-31T12:00+99:00"), false);
check("offset minute 60 is rejected", isValidDateOnly("2025-08-31T12:00+05:60"), false);
check("a valid negative offset is accepted", isValidDateOnly("2025-08-31T12:00-05:00"), true);
check("the maximum offset is accepted", isValidDateOnly("2025-08-31T12:00+23:59"), true);
check("an offset without a colon is accepted", isValidDateOnly("2025-08-31T12:00+0530"), true);
check("a rejected offset has no machine value", isoDateOnly("2025-08-31T12:00+99:99"), undefined);

// --- years 0000-0099 (Date.UTC maps 0-99 to 1900-1999) ---------------------
check("year 0000 Feb 29 is a real date", isValidDateOnly("0000-02-29"), true);
check("year 0000 Feb 30 is not", isValidDateOnly("0000-02-30"), false);
check("year 0004 Feb 29 is a real date", isValidDateOnly("0004-02-29"), true);
check("year 0001 is accepted", isValidDateOnly("0001-01-01"), true);
check("the machine value pads the year to four digits", isoDateOnly("0001-01-01"), "0001-01-01");
check("an early year formats with its own year", formatDateOnly("0001-01-01"), "January 01, 0001");
check("1900 is not a leap year", isValidDateOnly("1900-02-29"), false);

// --- Date objects ----------------------------------------------------------
check("a valid Date object is accepted", isValidDateOnly(new Date("2025-08-31T00:00:00Z")), true);
check("a valid Date object formats", formatDateOnly(new Date("2025-08-31T00:00:00Z")), "August 31, 2025");
check("an invalid Date object is rejected", isValidDateOnly(new Date("not a date")), false);
check("an invalid Date object does not throw", formatDateOnly(new Date("not a date")), "");
check("an invalid Date object has no machine value", isoDateOnly(new Date(NaN)), undefined);

// --- missing input ---------------------------------------------------------
check("undefined yields an empty string", formatDateOnly(undefined), "");
check("null yields an empty string", formatDateOnly(null), "");
check("an empty string yields an empty string", formatDateOnly(""), "");
check("undefined is not valid", isValidDateOnly(undefined), false);
check("undefined is not a machine value", isoDateOnly(undefined), undefined);

// --- parseDateParts --------------------------------------------------------
check("parts are 1-based for the month", parseDateParts("2025-08-31"), { year: 2025, month: 8, day: 31 });
check("parts are null for garbage", parseDateParts("nonsense"), null);

// --- a defect is not silently swallowed -----------------------------------
check("no case threw an exception", true, true);

console.log(`\nformat-date: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log(`failures:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
