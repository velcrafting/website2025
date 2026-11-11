import { reviseBrief, type BriefField, type BriefRevision } from "./brief";

export const stages = [
  {
    id: "discovery", title: "Discovery", purpose: "Get clear on the problem and what a useful result would look like.",
    studio: "Map the current workflow and identify what we still need to learn.",
    client: "Bring the goal, constraints and a few representative examples.",
    output: "Discussion brief", sample: [["Goal", "Review incoming requests in one place."], ["Open question", "Who makes the final decision?"]],
  },
  {
    id: "quote", title: "Quote", purpose: "Understand the basis for pricing when a separate quote helps.",
    studio: "Explain the options and what affects the cost.",
    client: "Share budget guidance or procurement requirements.",
    output: "Quote outline", sample: [["Pricing basis", "One request review workflow."], ["Assumption", "The team supplies sample requests."]],
  },
  {
    id: "proposal", title: "Proposal", purpose: "Agree on what we’ll deliver and how you’ll know it’s ready.",
    studio: "Write the scope, exclusions and acceptance checks.",
    client: "Review the scope and name who can approve it.",
    output: "Proposal", sample: [["In scope", "A reviewed workflow and a testable prototype."], ["Out of scope", "Live rollout."]],
  },
  {
    id: "start", title: "Start", purpose: "Get the people and inputs in place for the first milestone.",
    studio: "Identify owners, dependencies and the first milestone.",
    client: "Provide agreed inputs and appropriate access.",
    output: "Kickoff checklist", sample: [["Inputs", "Representative, nonsensitive requests."], ["Reviewer", "A person who can test the workflow."]],
  },
  {
    id: "updates", title: "Updates", purpose: "See what changed and where your decision is needed.",
    studio: "Share progress, evidence and open decisions.",
    client: "Review the work and resolve decisions in your scope.",
    output: "Progress note", sample: [["Ready for review", "The draft request workflow."], ["Decision needed", "Where should exceptions go?"]],
  },
  {
    id: "delivery", title: "Delivery", purpose: "Leave your team with something they can use and maintain.",
    studio: "Hand over the work, operating notes and known limitations.",
    client: "Review the result and confirm who owns it next.",
    output: "Handoff packet", sample: [["Included", "Prototype, decision record and usage notes."], ["Follow-up", "Review exceptions after the first team trial."]],
  },
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
