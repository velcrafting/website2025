import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { asStakeholder } from "./database";
import { verifiedIdentity } from "./auth";
import { isClientHost, isUuid } from "./request-boundary";

export const workspaceStatuses = ["Discovery","In progress","Ready for review","Delivered","On hold"] as const;
export const stages = ["discovery","quote","proposal","kickoff","updates","decisions","delivery"] as const;
export type Stage = typeof stages[number];
export const stageTitles: Record<Stage, string> = {
  discovery: "Discovery", quote: "Quote", proposal: "Proposal", kickoff: "Kickoff",
  updates: "Updates", decisions: "Decisions", delivery: "Delivery",
};
const stageFields: Record<Stage, readonly string[]> = {
  discovery: ["Goals", "Constraints", "Open questions"],
  quote: ["Pricing basis overview", "Assumptions", "Decision requested"],
  proposal: ["Outcome", "Deliverables", "Exclusions", "Responsibilities", "Completion checks"],
  kickoff: ["Readiness", "Owners", "Dependencies", "First milestone"],
  updates: ["Completed work", "Evidence", "Blockers", "Next steps"],
  decisions: ["Decision", "Owner", "Rationale", "Follow-up"],
  delivery: ["Artifacts", "Instructions", "Operating owner", "Remaining items"],
};
export const getStageFields = (stage: Stage) => stageFields[stage];

export const workspaceDraft = z.strictObject({
  engagementId: z.uuid(), itemId: z.uuid(), expected: z.number().int().min(0).max(10_000),
  stage: z.enum(stages), title: z.string().trim().min(1).max(180),
  sections: z.array(z.strictObject({ label: z.string().max(60), text: z.string().trim().min(1).max(1800) })).min(1).max(8),
  terms: z.string().trim().min(1).max(4000).optional(),
}).refine((value) => {
  const labels = value.sections.map((section) => section.label);
  return labels.every((label) => getStageFields(value.stage).includes(label)) &&
    new Set(labels).size === labels.length && (!value.terms || value.stage === "proposal" || value.stage === "quote");
});

export async function workspaceIdentity() {
  if (!isClientHost((await headers()).get("host"))) return null;
  return verifiedIdentity("client");
}

export async function requireWorkspaceIdentity() {
  if (!isClientHost((await headers()).get("host"))) notFound();
  const identity = await workspaceIdentity();
  if (!identity) redirect("/login");
  return identity;
}

export type Engagement = {
  id: string; title: string; client: string; project: string; client_id: string; project_id: string;
  status: string; status_version: number; objective: string | null; next_action: string | null; updated: Date | null;
};

export async function workspaceEngagements(user: string, scope?: { id: string; kind: "client" | "project" }) {
  if (scope && !isUuid(scope.id)) return [];
  return asStakeholder(user, (tx) => tx<Engagement[]>`
    select e.id,e.title,e.client_id,e.project_id,c.name as client,p.title as project,e.status,e.status_version,e.objective,e.next_action,
      (select max(r.published_at) from velcrafting_private.published_revision r where r.engagement_id=e.id) as updated
    from velcrafting_private.engagement e
    join velcrafting_private.client c on c.id=e.client_id
    join velcrafting_private.project p on p.id=e.project_id
    where (${scope?.id ?? null}::uuid is null or
      case when ${scope?.kind ?? "project"} = 'client' then e.client_id else e.project_id end = ${scope?.id ?? null}::uuid)
    order by e.title`);
}

type Section = { label: string; text: string };
type Revision = { item_id: string; version: number; title: string; published_at: Date; body: { stage?: Stage; sections?: Section[] } };
type Draft = { item_id: string; version: number; title: string; stage: Stage; body: { sections?: Section[] }; prior: number; terms?: string };

export async function workspaceEngagement(user: string, id: string) {
  if (!isUuid(id)) return null;
  return asStakeholder(user, async (tx) => {
    const [engagement] = await tx<Engagement[]>`select e.id,e.title,e.client_id,e.project_id,c.name as client,p.title as project,e.status,e.status_version,e.objective,e.next_action,
      (select max(r.published_at) from velcrafting_private.published_revision r where r.engagement_id=e.id) as updated
      from velcrafting_private.engagement e join velcrafting_private.client c on c.id=e.client_id
      join velcrafting_private.project p on p.id=e.project_id where e.id=${id}`;
    if (!engagement) return null;
    const revisions = await tx<Revision[]>`select distinct on (item_id) item_id,version,title,published_at,body
      from velcrafting_private.published_revision where engagement_id=${id} order by item_id,version desc`;
    const files = await tx<{ id: string; filename: string; item_id: string; version: number }[]>`
      select id,filename,item_id,version from velcrafting_private.workspace_file where engagement_id=${id} order by filename`;
    const capabilities = (await tx<{ capability: string }[]>`select capability from velcrafting_private.staff_access
      where engagement_id=${id}`).map((row) => row.capability);
    const accepted = await tx<{ item_id: string; version: number; title: string }[]>`select a.item_id,a.version,r.title
      from velcrafting_private.workspace_agreement a
      join velcrafting_private.published_revision r on (r.engagement_id,r.item_id,r.version)=(a.engagement_id,a.item_id,a.version)
      where a.engagement_id=${id} order by a.recorded_at`;
    return { engagement, revisions: revisions.sort((a,b) => b.published_at.getTime()-a.published_at.getTime()), files, capabilities, accepted };
  });
}

export async function workspaceDrafts(user: string, id: string) {
  return asStakeholder(user, async (tx) => {
    const drafts = await tx<Draft[]>`select distinct on (d.item_id) d.item_id,d.version,d.title,d.stage,d.body,
      coalesce((select max(version) from velcrafting_private.published_revision p
        where p.engagement_id=d.engagement_id and p.item_id=d.item_id),0) as prior
      from velcrafting_private.workspace_draft d where d.engagement_id=${id} order by d.item_id,d.version desc`;
    const terms = await tx<{ item: string; version: number; terms: string }[]>`select * from velcrafting_private.read_workspace_draft_terms(${id})`;
    return drafts.map((draft) => ({ ...draft, terms: terms.find(({item,version}) => item===draft.item_id && version===draft.version)?.terms }));
  });
}

export async function workspaceDocument(user: string, id: string, item: string, version: number) {
  if (!isUuid(id) || !isUuid(item) || !Number.isSafeInteger(version) || version < 1) return null;
  return asStakeholder(user, async (tx) => {
    const [revision] = await tx<Revision[]>`select item_id,version,title,published_at,body from velcrafting_private.published_revision
      where engagement_id=${id} and item_id=${item} and version=${version}`;
    if (!revision) return null;
    const [commercial] = await tx<{ terms: { text: string } }[]>`select terms from velcrafting_private.issued_terms
      where engagement_id=${id} and item_id=${item} and version=${version}`;
    return { revision, terms: commercial?.terms.text };
  });
}
