import { fieldLabels, type FieldKey } from "./brief";
import { parseExplorerBlock } from "./catalog";

export const aiNoticeVersion = "consulting-ai-recording-v1";
export const aiNotice = "When you send a message, Velcrafting records the message and the AI response, including unfinished conversations. Command Code processes the submitted context. Velcrafting uses these records to answer inquiries, operate the service and review failures. Unsent drafts stay in your browser.";

export type Suggestion = { field: FieldKey; text: string };
export type ShapingReply = { reply: string; suggestions: Suggestion[] };

export function parseShapingReply(raw: string): ShapingReply | null {
  try {
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).length !== 2 || typeof value.reply !== "string" ||
      !Array.isArray(value.suggestions) || value.suggestions.length > 4) return null;
    const plain = (text: unknown) => typeof text === "string" &&
      !/(?:\p{Sc}\s*\d|\d\s*\p{Sc}|\b(?:USD|EUR|GBP|CAD|AUD|INR)\s*\d|\b\d[\d,.]*\s*(?:USD|EUR|GBP|CAD|AUD|INR)\b|\b(?:we guarantee|guaranteed|will cost|will be delivered by)\b)/iu.test(text) &&
      parseExplorerBlock({ kind: "question", text });
    if (!plain(value.reply)) return null;
    const keys = new Set<string>();
    const suggestions: Suggestion[] = [];
    for (const item of value.suggestions) {
      if (!item || Object.keys(item).length !== 2 || typeof item.field !== "string" ||
        !Object.hasOwn(fieldLabels,item.field) || keys.has(item.field) || !plain(item.text)) return null;
      keys.add(item.field);
      suggestions.push({ field: item.field, text: item.text });
    }
    return { reply: value.reply, suggestions };
  } catch { return null; }
}
