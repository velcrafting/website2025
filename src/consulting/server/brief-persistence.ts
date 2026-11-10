import { z } from "zod";
import { fieldLabels, maxFieldLength, scopeChoices, services } from "../brief";

const fields = z.enum(Object.keys(fieldLabels) as [keyof typeof fieldLabels, ...(keyof typeof fieldLabels)[]]);
const input = z.strictObject({
  text: z.string().max(maxFieldLength),
  source: z.enum(["visitor","model_suggestion","staff","fictional_example"]),
  confirmation: z.enum(["stated","suggested","unknown"]),
  sourceMessageIds: z.array(z.string().max(60)).max(16),
});
export const briefSnapshot = z.strictObject({
  id: z.uuid(), version: z.number().int().min(1).max(10_000),
  createdAt: z.iso.datetime(), revisedAt: z.iso.datetime(),
  state: z.enum(["in_progress","reviewed"]),
  service: z.enum(Object.keys(services) as [keyof typeof services, ...(keyof typeof services)[]]),
  fields: z.partialRecord(fields,input),
  scope: z.strictObject({
    level: z.enum(["", ...scopeChoices.level.choices]),
    breadth: z.enum(["", ...scopeChoices.breadth.choices]),
    readiness: z.enum(["", ...scopeChoices.readiness.choices]),
    audience: z.enum(["", ...scopeChoices.audience.choices]),
    involvement: z.enum(["", ...scopeChoices.involvement.choices]),
  }),
  corrections: z.array(fields).max(Object.keys(fieldLabels).length),
  example: z.boolean(),
}).refine((brief) => brief.createdAt <= brief.revisedAt);
