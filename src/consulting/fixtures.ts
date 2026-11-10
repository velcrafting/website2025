import { reviseBrief, type BriefField, type BriefRevision } from "./brief";

export const stages = [
  { id: "discovery", title: "Discovery", purpose: "Understand the problem, the people involved and what is still unknown.", studio: "Gather context and identify unknowns.", client: "Bring goals, constraints and relevant material.", output: "A brief and proposed next step.", example: "A fictional team wants a clearer way to review recurring requests. Who owns the final decision?" },
  { id: "quote", title: "Quote", purpose: "Establish commercial direction when useful.", studio: "Explain the pricing basis, options and assumptions.", client: "Share budget direction or procurement requirements.", output: "A dated quote, or pricing within the proposal.", example: "The example quote identifies a pricing basis and assumptions. Amounts are intentionally omitted." },
  { id: "proposal", title: "Proposal", purpose: "Make the work, responsibilities and completion checks concrete.", studio: "Define deliverables, exclusions and how we will check the work.", client: "Review scope and name the authorized decision maker.", output: "An identifiable version for external agreement.", example: "The team gets a reviewed workflow and a bounded prototype. Live rollout is outside this fictional scope." },
  { id: "start", title: "Start", purpose: "Agree what is ready and what can begin.", studio: "Identify owners, dependencies and the first milestone.", client: "Provide agreed inputs and appropriate access.", output: "A practical readiness checklist.", example: "The team provides representative, nonsensitive examples and names a reviewer." },
  { id: "updates", title: "Updates", purpose: "Show what changed and where a decision is needed.", studio: "Record dated work, evidence, blockers and next steps.", client: "Review the work and make named decisions.", output: "A preserved update and clear next action.", example: "The draft workflow is ready for review. A routing decision is still open." },
  { id: "delivery", title: "Delivery", purpose: "Make the result usable by the people who will own it.", studio: "Provide final artifacts, instructions and remaining items.", client: "Review the result and take operating ownership.", output: "A handoff and agreed follow-up.", example: "The handoff includes the prototype, decision record, usage notes and remaining limitations." },
] as const;

export const examples = {
  software: {
    title: "Software prototype",
    service: "build",
    problem: "A fictional operations team reviews recurring requests in several places.",
    outcome: "Test a single review queue using representative, nonsensitive examples.",
    question: "Who can make the final routing decision, and what would they need to see?",
  },
  communications: {
    title: "Communications review",
    service: "communications",
    problem: "A fictional volunteer group has several conflicting versions of its welcome guide.",
    outcome: "Agree on a reviewed guide and assign an owner to keep it current.",
    question: "Which sources can the editor trust, and who should approve changes?",
  },
} as const;

export function exampleBrief(key: keyof typeof examples, stamp: { id: string; now: string }): BriefRevision {
  const example = examples[key];
  const base = reviseBrief(null, 0, {
    service: example.service, fields: {}, scope: { level: "", breadth: "", readiness: "", audience: "", involvement: "" },
  }, stamp);
  const field = (text: string): BriefField => Object.freeze({
    text, source: "fictional_example", confirmation: "suggested", sourceMessageIds: Object.freeze([]),
  });
  return Object.freeze({ ...base, example: true, fields: Object.freeze({
    problem: field(example.problem), outcome: field(example.outcome), questions: field(example.question),
  }) });
}
