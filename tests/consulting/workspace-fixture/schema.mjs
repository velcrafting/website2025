import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function loadWorkspaceSchema(exec) {
  await exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role editorial;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  for (const file of ["004-client-workspace-boundary.sql", "005-ai-attempt-ledger.sql", "006-consulting-identity-workspace.sql"]) {
    await exec(await readFile(new URL("../../../db/postgres/" + file, import.meta.url), "utf8"));
  }
}

export async function seedWorkspace(query) {
  const id = Object.fromEntries([
    "viewer", "commercial", "betaUser", "drafter", "issuer", "recorder", "prospect",
    "client", "project", "alpha", "alphaOther", "betaClient", "betaProject", "beta",
    "proposal", "betaItem", "ordinaryFile", "commercialFile", "betaFile", "authority", "betaAuthority",
  ].map((name) => [name, randomUUID()]));
  const users = ["viewer", "commercial", "betaUser", "drafter", "issuer", "recorder", "prospect"];
  for (const role of users) await query("insert into auth.users values ($1)", id[role]);
  for (const role of users.filter((role) => role !== "prospect")) {
    await query("insert into @profile(user_id) values ($1)", id[role]);
  }
  await query("insert into @client values ($1,'Alpha Fiction'),($2,'Beta Fiction')", id.client, id.betaClient);
  await query("insert into @project(id,client_id,title) values ($1,$2,'Alpha Project'),($3,$4,'Beta Project')",
    id.project, id.client, id.betaProject, id.betaClient);
  await query(`insert into @engagement(id,client_id,project_id,title) values
    ($1,$2,$3,'Alpha Engagement'),($4,$2,$3,'Alpha Private Follow-up'),($5,$6,$7,'Beta Secret Engagement')`,
  id.alpha, id.client, id.project, id.alphaOther, id.beta, id.betaClient, id.betaProject);
  for (const [person, client, target, commercial] of [
    ["viewer", id.client, id.alpha, false], ["commercial", id.client, id.alpha, true],
    ["betaUser", id.betaClient, id.beta, false],
  ]) {
    await query("insert into @client_membership(client_id,user_id,granted_by) values ($1,$2,$3)", client, id[person], id.issuer);
    await query("insert into @engagement_grant(client_id,engagement_id,user_id,commercial,granted_by) values ($1,$2,$3,$4,$5)",
      client, target, id[person], commercial, id.issuer);
  }
  for (const [person, capability] of [["drafter", "draft"], ["issuer", "draft"], ["issuer", "publish"], ["issuer", "issue"], ["recorder", "record_agreement"]]) {
    await query("insert into @staff_access(user_id,engagement_id,capability) values($1,$2,$3)", id[person], id.alpha, capability);
  }
  const [ordinary, beta] = [
    { stage: "proposal", sections: [{ label: "Outcome", text: "FICTION_ALPHA_BASELINE" }] },
    { stage: "delivery", sections: [{ label: "Handoff", text: "FICTION_BETA_ONLY" }] },
  ];
  await query(`insert into @published_revision (engagement_id,item_id,version,title,body,published_by,published_at)
    values ($1,$2,1,'Alpha Proposal',$3,$4,now()-interval '1 hour'),
           ($5,$6,1,'Beta Handoff',$7,$4,now()-interval '1 hour')`, id.alpha, id.proposal, ordinary, id.issuer, id.beta, id.betaItem, beta);
  await query("insert into @issued_terms values ($1,$2,1,$3)", id.alpha, id.proposal, { text: "FICTION_ALPHA_COMMERCIAL" });
  await query(`insert into @workspace_file(id,engagement_id,item_id,version,commercial,filename,media_type,bytes)
    values ($1,$2,$3,1,false,'alpha-delivery.txt','text/plain',convert_to('FICTION_ALPHA_FILE','UTF8')),
           ($4,$2,$3,1,true,'alpha-commercial.txt','text/plain',convert_to('FICTION_ALPHA_COMMERCIAL_FILE','UTF8')),
           ($5,$6,$7,1,false,'beta-secret.txt','text/plain',convert_to('FICTION_BETA_FILE','UTF8'))`,
  id.ordinaryFile, id.alpha, id.proposal, id.commercialFile, id.betaFile, id.beta, id.betaItem);
  await query(`insert into @approval_authority(id,engagement_id,authorized_name,organization,authority_basis,valid_from)
    values($1,$2,'Fictional Approver','Alpha Fiction','Delegated project sponsor',now()-interval '1 day'),
          ($3,$4,'Other Approver','Beta Fiction','Delegated project sponsor',now()-interval '1 day')`,
  id.authority, id.alpha, id.betaAuthority, id.beta);
  return id;
}
