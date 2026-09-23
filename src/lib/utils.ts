import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names, with later Tailwind utilities winning over
 * earlier conflicting ones.
 *
 * This is the single class-merge helper for the shared UI layer. Components
 * accept a `className` prop and pass it through `cn`, so a caller can adjust
 * layout without restyling the component's own appearance.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
