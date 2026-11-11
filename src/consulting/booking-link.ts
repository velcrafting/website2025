import { normalizeBriefField } from "./brief";

export const maxBookingProblemLength = 600;

export function bookingLinkWithProblem(bookingUrl: string, problem: string): string | null {
  const notes = normalizeBriefField(problem);
  if (!notes || notes.length > maxBookingProblemLength) return null;
  const url = new URL(bookingUrl);
  if (url.origin !== "https://cal.com" || url.username || url.password) return null;
  url.searchParams.set("notes", notes);
  return url.href;
}
