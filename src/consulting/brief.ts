export const services = {
  review: ["Review and direction", "Make a sound decision with evidence, options and a recommendation."],
  build: ["Prototype and build", "Test something tangible with a working artifact and a clear handoff."],
  workflow: ["Workflow and AI integration", "Make repeated work more reliable with a bounded workflow and evaluation."],
  communications: ["Communications and knowledge", "Help people find reliable information with reviewed resources and clear ownership."],
  unsure: ["Not sure yet", "Start with the problem and leave the approach open."],
} as const;

export type Service = keyof typeof services;
export function parseService(value: unknown): Service {
  return typeof value === "string" && Object.hasOwn(services, value) ? value as Service : "unsure";
}

export const fieldLabels = {
  problem: "Problem or current context",
  audience: "Audience",
  outcome: "Desired outcome",
  constraints: "Constraints",
  inputs: "Known inputs",
  dependencies: "Dependencies",
  deliverables: "Possible deliverables",
  questions: "Open questions",
  nextStep: "Next discussion step",
} as const;

export type FieldKey = keyof typeof fieldLabels;
export type BriefField = Readonly<{
  text: string;
  source: "visitor" | "model_suggestion" | "staff" | "fictional_example";
  confirmation: "stated" | "suggested" | "unknown";
  sourceMessageIds: readonly string[];
}>;

export const scopeChoices = {
  level: { label: "Delivery level", choices: ["Review", "Prototype", "Live system"], effect: "Changes the deliverables, verification and operating responsibilities." },
  breadth: { label: "Workflow breadth", choices: ["One workflow", "Connected workflows"], effect: "Changes the dependencies and the people who need to coordinate." },
  readiness: { label: "Information readiness", choices: ["Existing material", "Preparation needed"], effect: "Changes what needs to be gathered and reviewed first." },
  audience: { label: "Access needs", choices: ["Internal team", "External users"], effect: "Changes access, accessibility and operating requirements." },
  involvement: { label: "Involvement", choices: ["Handoff", "Continuing support"], effect: "Clarifies who operates the result and what follow-up to discuss." },
} as const;

type ScopeKey = keyof typeof scopeChoices;
type Scope = Readonly<Record<ScopeKey, string>>;
export type BriefRevision = Readonly<{
  id: string;
  version: number;
  createdAt: string;
  revisedAt: string;
  state: "in_progress" | "reviewed";
  service: Service;
  fields: Readonly<Partial<Record<FieldKey, BriefField>>>;
  scope: Scope;
  corrections: readonly FieldKey[];
  example: boolean;
}>;

export const maxFieldLength = 1200;
export const discussionNote = "This is a discussion brief. Scope, pricing and commitments are confirmed after review.";

export function normalizeBriefField(input: string): string {
  return input.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

export function reviseBrief(
  current: BriefRevision | null,
  expectedVersion: number,
  edit: { service: Service; fields: Partial<Record<FieldKey, string>>; scope: Scope; review?: boolean },
  stamp: { id: string; now: string },
): BriefRevision {
  if ((current?.version ?? 0) !== expectedVersion) throw new Error("The brief changed. Review the latest revision before saving.");
  const fields = { ...current?.fields };
  const corrections: FieldKey[] = [];
  for (const key of Object.keys(fieldLabels) as FieldKey[]) {
    const input = edit.fields[key];
    if (input === undefined) continue;
    const value = normalizeBriefField(input);
    if (value.length > maxFieldLength) throw new Error("A brief field is too long.");
    if (value !== (fields[key]?.text ?? "")) {
      corrections.push(key);
      fields[key] = Object.freeze({ text: value, source: "visitor", confirmation: value ? "stated" : "unknown", sourceMessageIds: Object.freeze([]) });
    }
  }
  const scope = Object.freeze(Object.fromEntries(
    (Object.keys(scopeChoices) as ScopeKey[]).map((key) => {
      const value = edit.scope[key];
      if (value && !(scopeChoices[key].choices as readonly string[]).includes(value)) throw new Error("Unknown scope choice.");
      return [key, value];
    }),
  ) as Record<ScopeKey, string>);
  return Object.freeze({
    id: current?.id ?? stamp.id,
    version: expectedVersion + 1,
    createdAt: current?.createdAt ?? stamp.now,
    revisedAt: stamp.now,
    state: edit.review ? "reviewed" : "in_progress",
    service: parseService(edit.service),
    fields: Object.freeze(fields),
    scope,
    corrections: Object.freeze(corrections),
    example: current?.example ?? false,
  });
}

export function briefSections(brief: BriefRevision): readonly (readonly [string, string])[] {
  return [
    ["Revision", `v${brief.version} · ${brief.revisedAt} · ${brief.state === "reviewed" ? "Reviewed by visitor" : "In progress"}`],
    ...(brief.example ? [["Source", "Includes fictional example material."] as const] : []),
    ["Service", services[brief.service][0]],
    ...Object.entries(fieldLabels).map(([key, label]) => {
      const field = brief.fields[key as FieldKey];
      const marker = field?.source === "fictional_example" ? "Fictional example"
        : field?.source === "model_suggestion" ? "AI suggestion"
        : field?.source === "staff" ? "Staff" : "Visitor stated";
      return [label, field?.text ? `${marker}: ${field.text}` : "Not yet known"] as const;
    }),
    ["Scope choices", (Object.keys(scopeChoices) as ScopeKey[]).map((key) =>
      `${scopeChoices[key].label}: ${brief.scope[key] || "Not sure yet"}`,
    ).join("\n")],
    ["Use", discussionNote],
  ];
}

export const briefTitle = "Velcrafting discussion brief";
export function briefMarkdown(brief: BriefRevision): string {
  // Treat every value as text, including Markdown autolinks, tags and images.
  const literal = (value: string) => value.split("\n").map((line) =>
    line.replace(/[!"#$%&'()*+,\-./:;<=>?@[\]\\^`_{|}~]/g, "\\$&").trimStart(),
  ).join("  \n");
  return `# ${briefTitle}\n\n${briefSections(brief).map(([label, value]) =>
    `## ${label}\n\n${literal(value)}`,
  ).join("\n\n")}\n`;
}

export function briefText(brief: BriefRevision): string {
  return [briefTitle, ...briefSections(brief).map(([label, value]) => `${label}\n${value}`)].join("\n\n");
}
