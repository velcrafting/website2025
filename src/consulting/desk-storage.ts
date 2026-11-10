import { fieldLabels, maxFieldLength, scopeChoices, services, type BriefRevision, type FieldKey, type Service } from "./brief";

export const fields = Object.keys(fieldLabels) as FieldKey[];
export const scopeKeys = Object.keys(scopeChoices) as (keyof typeof scopeChoices)[];

export type BriefDraft = {
  service: Service;
  fields: Partial<Record<FieldKey, string>>;
  scope: BriefRevision["scope"];
};

export type DeskState = {
  entry: Service;
  brief: BriefRevision | null;
  draft: BriefDraft;
  dirty: boolean;
  example: "software" | "communications" | null;
};

const storageKey = "velcrafting.consulting.desk.v1";

export function draftFromRevision(service: Service, brief?: BriefRevision): BriefDraft {
  return {
    service: brief?.service ?? service,
    fields: Object.fromEntries(fields.map((key) => [key, brief?.fields[key]?.text ?? ""])),
    scope: Object.fromEntries(scopeKeys.map((key) => [key, brief?.scope[key] ?? ""])) as BriefRevision["scope"],
  };
}

export function newDesk(entry: Service): DeskState {
  return { entry, brief: null, draft: draftFromRevision(entry), dirty: false, example: null };
}

export function chooseDeskEntry(desk: DeskState, entry: Service): DeskState {
  if (desk.entry === entry) return desk;
  return {
    ...desk, entry, draft: { ...desk.draft, service: entry },
    dirty: desk.dirty || (!!desk.brief && desk.brief.service !== entry),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isService(value: unknown): value is Service {
  return typeof value === "string" && Object.hasOwn(services, value);
}

function isScope(value: unknown): boolean {
  return isRecord(value) && scopeKeys.every((key) =>
    value[key] === "" || (scopeChoices[key].choices as readonly unknown[]).includes(value[key]),
  );
}

function isFieldText(value: unknown): value is string {
  return typeof value === "string" && value.length <= maxFieldLength;
}

function isBrief(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || !Number.isSafeInteger(value.version) ||
      Number(value.version) < 1 || !isService(value.service) || !isScope(value.scope) ||
      !["in_progress", "reviewed"].includes(String(value.state)) || typeof value.example !== "boolean" ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.revisedAt !== "string" || !Number.isFinite(Date.parse(value.revisedAt)) ||
      !Array.isArray(value.corrections) || !value.corrections.every((key) => fields.includes(key))) return false;
  const saved = value.fields;
  return isRecord(saved) && Object.entries(saved).every(([key, field]) =>
    fields.includes(key as FieldKey) && isRecord(field) && isFieldText(field.text) &&
    ["visitor", "model_suggestion", "staff", "fictional_example"].includes(String(field.source)) &&
    ["stated", "suggested", "unknown"].includes(String(field.confirmation)) &&
    Array.isArray(field.sourceMessageIds) && field.sourceMessageIds.every((id) => typeof id === "string"),
  );
}

export function readDesk(storage: Storage): DeskState | null {
  const raw = storage.getItem(storageKey);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (isRecord(value) && isService(value.entry) && typeof value.dirty === "boolean" &&
        [null, "software", "communications"].includes(value.example as DeskState["example"]) &&
        (value.brief === null || isBrief(value.brief)) &&
        isRecord(value.draft) && isService(value.draft.service) && isScope(value.draft.scope) &&
        isRecord(value.draft.fields) && fields.every((key) => isFieldText((value.draft as BriefDraft).fields[key]))) {
      return value as DeskState;
    }
  } catch {
    // An older or corrupt browser entry should not block a new draft.
  }
  return null;
}

export function writeDesk(storage: Storage, desk: DeskState) {
  storage.setItem(storageKey, JSON.stringify(desk));
}
