import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import { chromium } from "playwright";
import postgres from "postgres";
import { fixtureAuth, fixtureCode } from "./workspace-fixture/auth.mjs";
import { loadWorkspaceSchema, seedWorkspace } from "./workspace-fixture/schema.mjs";

const pgBin = process.env.VELCRAFTING_NATIVE_PG_BIN;
assert.ok(pgBin, "Set VELCRAFTING_NATIVE_PG_BIN to the bin directory of a local PostgreSQL installation");
const root = await mkdtemp("/tmp/vel-workspace-");
const artifacts = process.env.VELCRAFTING_WORKSPACE_ARTIFACTS ?? await mkdtemp(join(tmpdir(), "vel-workspace-artifacts-"));
const appDir = join(root, "app");
const data = join(root, "data");
const source = process.cwd();
const exec = promisify(execFile);
const run = (program, ...args) => exec(join(pgBin, program), args, { timeout: 20_000 });
const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
};
const close = (server) => new Promise((done) => server.close(done));
async function ephemeralPort() {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

let auth, sql, app, browser, publicProxy, started = false;
const log = [];
try {
  await mkdir(artifacts, { recursive: true });
  await mkdir(appDir);
  const [gitHead, gitStatus] = await Promise.all([exec("git", ["rev-parse", "HEAD"]), exec("git", ["status", "--porcelain"])]);
  for (const name of ["src", "public", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) {
    await cp(join(source, name), join(appDir, name), { recursive: true });
  }
  const snapshotHash = createHash("sha256");
  const snapshotFiles = (await readdir(appDir, { withFileTypes: true, recursive: true }))
    .filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name)).sort();
  for (const path of snapshotFiles) {
    const bytes = await readFile(path);
    snapshotHash.update(JSON.stringify([path.slice(appDir.length + 1), bytes.length]));
    snapshotHash.update(bytes);
  }
  await symlink(join(source, "node_modules"), join(appDir, "node_modules"), "dir");


  const [dbPort, clientPort] = await Promise.all([ephemeralPort(), ephemeralPort()]);
  await run("initdb", "-D", data, "-U", "postgres", "--auth-local=trust", "--auth-host=scram-sha-256", "--no-locale");
  await appendFile(join(data, "postgresql.conf"), `\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '${root}'\nport = ${dbPort}\n`);
  await run("pg_ctl", "-D", data, "-l", join(root, "postgres.log"), "-w", "start");
  started = true;
  sql = postgres({ path: join(root, `.s.PGSQL.${dbPort}`), database: "postgres", username: "postgres", max: 1 });
  const schemaHash = createHash("sha256");
  await loadWorkspaceSchema((statement) => { schemaHash.update(statement); return sql.unsafe(statement); }, { provisioning: true, intake: true });
  const id = await seedWorkspace((statement, ...args) => sql.unsafe(statement.replaceAll("@", "velcrafting_private."), args));
  await sql`insert into velcrafting_private.workspace_provisioner(user_id) values(${id.issuer})`;
  await sql`update auth.users set email='issuer@workspace.example.invalid' where id=${id.issuer}`;
  const password = randomBytes(24).toString("hex");
  await sql.unsafe(`alter role velcrafting_runtime login password '${password}'`);
  auth = await fixtureAuth(Object.fromEntries(["viewer", "commercial", "betaUser", "drafter", "issuer", "recorder", "prospect"].map((name) => [name, id[name]])));

  await sql`insert into velcrafting_private.ai_allowance(day,unit_limit) values ((now() at time zone 'UTC')::date,1)`;
  const providerCalls = [];
  const fixtureQuestion = "How should the fictional workshop hand off its results?";
  const fixtureAnswer = JSON.stringify({ reply: "Who will own the handoff?",
    suggestions: [{ field: "questions", text: "Name the owner after the handoff." }] });
  publicProxy = createServer(async (incoming, outgoing) => {
    if (incoming.url === "/__fixture_provider") {
      try {
        let raw = "";
        for await (const chunk of incoming) raw += chunk;
        const sent = JSON.parse(raw);
        const [durable] = await sql`select a.dispatch_claimed_at,a.reservation_state,o.notice_version,c.body as context
          from velcrafting_private.ai_call_attempt a join velcrafting_private.ai_operation o on o.id=a.operation_id
          join velcrafting_private.ai_content c on c.id=a.input_context_id`;
        assert.ok(durable.dispatch_claimed_at);
        assert.equal(durable.reservation_state,"held");
        assert.equal(durable.notice_version,"consulting-ai-recording-v1");
        assert.equal(sent.model,"deepseek/deepseek-v4.1-flash");
        assert.deepEqual(sent.messages.map(({role,content}) => ({role,content})),
          [{role:"system",content:JSON.parse(durable.context).system},...JSON.parse(durable.context).messages]);
        assert.equal(sent.messages.at(-1).content,fixtureQuestion);
        providerCalls.push(sent.model);
        outgoing.writeHead(200, { "content-type":"application/json", "x-request-id":"fiction-provider-receipt" });
        outgoing.end(JSON.stringify({ id:"fiction-provider-response", object:"chat.completion", created:123456,
          model:sent.model, choices:[{index:0,message:{role:"assistant",content:fixtureAnswer},finish_reason:"stop"}],
          usage:{prompt_tokens:18,completion_tokens:12,total_tokens:30} }));
      } catch (error) { log.push(String(error)); outgoing.writeHead(502); outgoing.end("{}"); }
      return;
    }
    const upstream = request({ hostname: "localhost", port: clientPort, path: incoming.url, method: incoming.method, headers: incoming.headers },
      (response) => { outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing); });
    upstream.on("error", () => { outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  const publicPort = await listen(publicProxy);
  const client = `http://localhost:${clientPort}`;
  const publicSite = `http://127.0.0.1:${publicPort}`;
  const preload = join(root, "fixture-command-code.cjs");
  await writeFile(preload, `
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (target, options) => {
      const url = typeof target === 'string' ? target : target instanceof URL ? target.href : target.url;
      if (url.startsWith('https://api.commandcode.ai/')) {
        if (url !== 'https://api.commandcode.ai/provider/v1/chat/completions' ||
            new Headers(options?.headers).get('authorization') !== 'Bearer fixture-only-key') {
          throw new Error('Fixture refused a non-test dispatch');
        }
        return originalFetch('${publicSite}/__fixture_provider', options);
      }
      return originalFetch(target, options);
    };
  `);
  app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "localhost", "--port", String(clientPort)], {
    cwd: appDir, env: {
      PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: `--require=${preload}`, CLIENT_SITE_ORIGIN: client, PUBLIC_SITE_ORIGIN: publicSite,
      VELCRAFTING_AI_ENABLED: "1", VELCRAFTING_AI_MAINTENANCE_TOKEN: "fixture-only-maintenance-token00000",
      VELCRAFTING_AI_PAYLOAD_RETENTION_HOURS: "1", COMMAND_CODE_API_KEY: "fixture-only-key",
      COMMAND_CODE_VERIFIED_MODEL: "deepseek/deepseek-v4.1-flash",
      VELCRAFTING_BOOKING_ENABLED: "1", VELCRAFTING_CAL_EVENT_TYPE_ID: "42",
      VELCRAFTING_BOOKING_OWNER_EMAIL: "issuer@workspace.example.invalid",
      VELCRAFTING_SUPABASE_URL: auth.origin, VELCRAFTING_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
      VELCRAFTING_CLIENT_AUTH_ENABLED: "1", VELCRAFTING_PROSPECT_AUTH_ENABLED: "1", VELCRAFTING_EXPLORER_ENABLED: "1",
      VELCRAFTING_RUNTIME_DATABASE_URL: `postgres://velcrafting_runtime:${password}@127.0.0.1:${dbPort}/postgres`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [app.stdout, app.stderr]) stream.on("data", (chunk) => log.push(String(chunk)));
  let ready = false;
  for (let attempt = 0; attempt < 120 && !ready; attempt++) {
    if (app.exitCode !== null) throw new Error("Workspace test application stopped");
    ready = await fetch(client + "/logo.svg").then((response) => response.ok).catch(() => false);
    if (!ready) await setTimeout(250);
  }
  assert.ok(ready, "Workspace test application did not start");

  browser = await chromium.launch({
    ...(process.env.CONSULTING_CHROMIUM_PATH ? { executablePath: process.env.CONSULTING_CHROMIUM_PATH } : {}),
    args: ["--disable-back-forward-cache"],
  });
  async function context(viewport = { width: 1440, height: 1000 }) {
    const instance = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await instance.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return [client, publicSite, `http://localhost:${publicPort}`].includes(url.origin) ? route.continue() : route.abort();
    });
    return instance;
  }
  async function signIn(instance, identity) {
    const page = await instance.newPage();
    const response = await page.goto(client + "/");
    assert.equal(response?.status(), 200, `Client sign-in route ended at ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 240)}`);
    await page.getByRole("heading", { name: "Welcome back." }).waitFor({ timeout: 8000 });
    await page.getByRole("textbox", { name: "Email address" }).fill(`${identity.toLowerCase()}@workspace.example.invalid`);
    await page.getByRole("button", { name: "Send a code" }).click();
    await page.getByRole("textbox", { name: "Email code" }).fill("000000");
    await page.getByRole("button", { name: "Verify code" }).click();
    await page.getByRole("status").filter({ hasText: "Code was invalid or expired" }).waitFor();
    await page.getByRole("textbox", { name: "Email code" }).fill(fixtureCode);
    await page.getByRole("button", { name: "Verify code" }).click();
    await page.getByRole("heading", { name: "Your engagements" }).waitFor();
    return page;
  }
  const viewer = await context();
  const page = await signIn(viewer, "viewer");
  const alphaLink = page.getByRole("link", { name: "Alpha Engagement" });
  await alphaLink.waitFor();
  assert.equal(await page.getByText(/Beta Secret Engagement|Alpha Private Follow-up/).count(), 0);
  assert.equal(await page.getByRole("navigation", { name: "Primary" }).count(), 0);
  await page.screenshot({ path: join(artifacts, "workspace-home-desktop.png") });
  await alphaLink.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Alpha Engagement" }).waitFor();
  const filePath = `/files/${id.ordinaryFile}/download`;
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "alpha-delivery.txt" }).click()]);
  assert.equal(download.suggestedFilename(), "alpha-delivery.txt");
  assert.equal(await readFile(await download.path(), "utf8"), "FICTION_ALPHA_FILE");
  const file = await viewer.request.get(client + filePath);
  assert.equal(file.status(), 200);
  assert.match(file.headers()["cache-control"], /private.*no-store/);
  const ownExport = `/documents/${id.alpha}/${id.proposal}/1/download`;
  const ordinary = await (await viewer.request.get(client + ownExport)).text();
  assert.match(ordinary, /Version 1[\s\S]*FICTION_ALPHA_BASELINE/);
  assert.doesNotMatch(ordinary, /FICTION_ALPHA_COMMERCIAL|FICTION_BETA/);
  for (const url of [
    client + `/files/${id.betaFile}/download`, client + `/files/${id.commercialFile}/download`,
    client + `/documents/${id.beta}/${id.betaItem}/1/download`, client + `/engagements/${id.beta}`,
    client + `/client-workspace/files/${id.betaFile}/download`, publicSite + filePath, publicSite + "/client-workspace" + filePath,
    `http://localhost:${publicPort}/client-workspace${filePath}`,
  ]) {
    const result = await viewer.request.get(url, { maxRedirects: 0 });
    assert.equal(result.status(), 404, url);
    assert.doesNotMatch(await result.text(), /FICTION_(ALPHA|BETA)/);
  }

  const commercial = await context({ width: 390, height: 844 });
  const commercialPage = await signIn(commercial, "commercial");
  assert.match(await (await commercial.request.get(client + ownExport)).text(), /FICTION_ALPHA_COMMERCIAL/);
  await commercialPage.getByRole("link", { name: "Alpha Engagement" }).click();
  await commercialPage.getByRole("link", { name: "alpha-commercial.txt" }).waitFor();
  await commercialPage.screenshot({ path: join(artifacts, "workspace-engagement-mobile.png") });
  assert.equal(await commercialPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await commercialPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  const zoom = await commercialPage.evaluate(() => {
    const root = document.documentElement;
    const base = parseFloat(getComputedStyle(root).fontSize);
    root.style.fontSize = "200%";
    return { ratio: parseFloat(getComputedStyle(root).fontSize) / base, scrolls: root.scrollWidth > innerWidth };
  });
  assert.deepEqual(zoom, { ratio: 2, scrolls: false });
  await commercialPage.screenshot({ path: join(artifacts, "workspace-engagement-mobile-text-200.png") });

  const beta = await context();
  const betaPage = await signIn(beta, "betaUser");
  assert.equal(await betaPage.getByRole("link", { name: "Alpha Engagement" }).count(), 0);
  assert.equal((await beta.request.get(client + filePath)).status(), 404);
  assert.equal((await beta.request.get(client + `/files/${id.betaFile}/download`)).status(), 200);

  const post = (instance, origin, path, data) => instance.request.post(origin + path, { headers: { origin }, data });
  const alphaAttempt = await post(viewer, client, "/api/consulting/workspace", {
    engagementId: id.alpha, itemId: randomUUID(), expected: 0, stage: "proposal", title: "Fictional browser draft", sections: [{ label: "Outcome", text: "Fictional scope" }],
  });
  assert.equal(alphaAttempt.status(), 404);
  const issuer = await context();
  const issuerPage = await signIn(issuer, "issuer");
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  await noScript.addCookies(await issuer.cookies(client));
  const unhydrated = await noScript.newPage();
  await unhydrated.goto(client + "/staff/setup");
  assert.equal(await unhydrated.getByRole("button",{name:"Create private engagement"}).isDisabled(),true);
  await noScript.close();
  await issuerPage.getByRole("link",{name:"Workspace setup"}).click();
  await issuerPage.getByRole("textbox",{name:"Client name"}).fill("Fictional browser client");
  await issuerPage.getByRole("textbox",{name:"Project title"}).fill("Fictional browser project");
  await issuerPage.getByRole("textbox",{name:"Engagement title"}).fill("Fictional browser setup");
  await issuerPage.getByRole("combobox",{name:"Workflow template"}).selectOption("communications-knowledge");
  await issuerPage.getByRole("textbox",{name:"Objective"}).fill("Fictional browser onboarding objective");
  const setupReply = issuerPage.waitForResponse((response) => response.url().endsWith("/api/consulting/workspace/provision"));
  await issuerPage.getByRole("button",{name:"Create private engagement"}).click();
  assert.equal((await setupReply).status(),201);
  await issuerPage.getByRole("link",{name:"Review the private discovery draft"}).click();
  await issuerPage.getByRole("heading",{name:"Author Fictional browser setup"}).waitFor();
  await issuerPage.getByRole("combobox",{name:"Saved drafts"}).selectOption({label:"Discovery · v1"});
  await issuerPage.getByRole("button",{name:"Preview saved revision 1"}).click();
  await issuerPage.locator("dd").getByText("Fictional browser onboarding objective",{exact:true}).waitFor();
  await issuerPage.goto(client + "/");
  const item = randomUUID();
  const draft = { engagementId: id.alpha, itemId: item, expected: 0, stage: "proposal", title: "Fictional browser draft", sections: [{ label: "Outcome", text: "Fictional scope" }], terms: "FICTION_UNTIL_ISSUED" };
  const mutation = (body) => post(issuer, client, "/api/consulting/workspace", body);
  assert.equal((await mutation(draft)).status(), 200);
  assert.equal((await mutation(draft)).status(), 409);
  assert.equal((await viewer.request.get(client + `/documents/${id.alpha}/${item}/1/download`)).status(), 404);
  const publish = { action: "publish", engagementId: id.alpha, itemId: item, version: 1, prior: 0, retry: randomUUID() };
  assert.equal((await mutation(publish)).status(), 200);
  assert.equal((await mutation(publish)).status(), 200);
  assert.doesNotMatch(await (await viewer.request.get(client + `/documents/${id.alpha}/${item}/1/download`)).text(), /FICTION_UNTIL_ISSUED/);
  assert.match(await (await commercial.request.get(client + `/documents/${id.alpha}/${item}/1/download`)).text(), /FICTION_UNTIL_ISSUED/);

  await issuerPage.getByRole("link", { name: "Alpha Engagement" }).click();
  await issuerPage.getByRole("link", { name: "Staff authoring" }).click();
  await issuerPage.getByRole("heading", { name: "Author Alpha Engagement" }).waitFor();
  await issuerPage.getByLabel("Status",{exact:true}).selectOption("Ready for review");
  await issuerPage.getByLabel("Next action and owner").fill("Fictional sponsor reviews the draft.");
  const progressReply = issuerPage.waitForResponse((response) => response.url().endsWith("/api/consulting/workspace") &&
    response.request().postDataJSON()?.action === "progress");
  const progressNavigation = issuerPage.waitForNavigation({waitUntil:"networkidle"});
  await issuerPage.getByRole("button",{name:"Save progress"}).click();
  assert.equal((await progressReply).status(),200);
  await progressNavigation;
  const status = await viewer.request.get(client + `/engagements/${id.alpha}`);
  assert.match(await status.text(),/Fictional sponsor reviews the draft/);
  assert.equal((await mutation({action:"progress",engagementId:id.alpha,expected:0,status:"Delivered",nextAction:"Stale fixture"})).status(),409);
  await issuerPage.getByRole("textbox", { name: "Title" }).fill("Fictional UI discovery");
  await issuerPage.getByRole("textbox", { name: "Goals" }).fill("FICTIONAL_DISCOVERY_GOAL");
  const uiSave = issuerPage.waitForResponse((reply) => reply.url().endsWith("/api/consulting/workspace") && reply.request().method() === "POST");
  const afterSave = issuerPage.waitForNavigation({ waitUntil: "networkidle" });
  await issuerPage.getByRole("button", { name: "Save new revision" }).click();
  assert.equal((await uiSave).status(), 200);
  await afterSave;
  const savedDraft = issuerPage.getByRole("combobox", { name: "Saved drafts" });
  await savedDraft.getByRole("option", { name: "Fictional UI discovery · v1" }).waitFor({ state: "attached" });
  await savedDraft.selectOption({ label: "Fictional UI discovery · v1" });
  await issuerPage.getByRole("button", { name: "Preview saved revision 1" }).click();
  await issuerPage.locator("dd").getByText("FICTIONAL_DISCOVERY_GOAL", { exact: true }).waitFor();
  const uiPublish = issuerPage.waitForResponse((reply) => reply.url().endsWith("/api/consulting/workspace") && reply.request().method() === "POST");
  const afterPublish = issuerPage.waitForNavigation({ waitUntil: "networkidle" });
  await issuerPage.getByRole("button", { name: "Publish this revision" }).click();
  assert.equal((await uiPublish).status(), 200);
  await afterPublish;
  const discovery = await viewer.request.get(client + `/engagements/${id.alpha}/discovery`);
  assert.equal(discovery.status(), 200);
  assert.match(await discovery.text(), /FICTIONAL_DISCOVERY_GOAL/);

  await savedDraft.getByRole("option", { name: "Fictional browser draft · v1" }).waitFor({ state: "attached" });
  await savedDraft.selectOption({ label: "Fictional browser draft · v1" });
  await issuerPage.getByRole("heading", { name: "Attach a private file to issued version 1" }).waitFor();
  await issuerPage.getByLabel("File", { exact: true }).setInputFiles({
    name: "fictional-browser-file.txt", mimeType: "text/plain", buffer: Buffer.from("FICTIONAL_BROWSER_UPLOAD"),
  });
  const uiUpload = issuerPage.waitForResponse((reply) => reply.url().endsWith("/api/consulting/workspace/files") && reply.request().method() === "POST");
  await issuerPage.getByRole("button", { name: "Store private file" }).click();
  assert.equal((await uiUpload).status(), 201);
  const [uploaded] = await sql`select id from velcrafting_private.workspace_file where filename='fictional-browser-file.txt'`;
  const uploadedPath = client + `/files/${uploaded.id}/download`;
  assert.equal(await (await viewer.request.get(uploadedPath)).text(), "FICTIONAL_BROWSER_UPLOAD");
  assert.equal((await beta.request.get(uploadedPath)).status(), 404);

  const recorder = await context();
  const recorderPage = await signIn(recorder, "recorder");
  await recorderPage.getByRole("link", { name: "Alpha Engagement" }).click();
  await recorderPage.getByRole("link", { name: "Staff authoring" }).click();
  await recorderPage.waitForLoadState("networkidle");
  assert.equal(await recorderPage.getByRole("button", { name: "Save new revision" }).count(), 0);
  const issuedSelect = recorderPage.getByRole("combobox", { name: /Saved drafts|Issued proposals/ });
  await issuedSelect.selectOption({ label: "Alpha Proposal · v1" });
  await recorderPage.getByRole("heading", { name: "Record external agreement for issued version 1" }).waitFor();
  await recorderPage.getByLabel("Authority record ID").fill(id.authority);
  await recorderPage.getByLabel("Agreement time (your local time)").fill(await recorderPage.evaluate(() =>
    new Date(Date.now() - (5 + new Date().getTimezoneOffset()) * 60_000).toISOString().slice(0, 16)));
  await recorderPage.getByLabel("Private evidence reference").fill("Fictional signed approval from named sponsor");
  const uiAgreement = recorderPage.waitForResponse((reply) => reply.url().endsWith("/api/consulting/workspace") && reply.request().method() === "POST");
  await recorderPage.getByRole("button", { name: "Record external agreement" }).click();
  assert.equal((await uiAgreement).status(), 200);
  await page.reload();
  await page.getByRole("link", { name: "Alpha Proposal · Version 1" }).waitFor();



  const prospect = await context();
  const otherProspect = await context();
  const email = "prospect@workspace.example.invalid";
  const p = (instance, path, body) => post(instance, publicSite, `/api/consulting/${path}`, body);
  assert.equal((await p(prospect, "auth", { action: "send", email })).status(), 409);
  for (const instance of [prospect, otherProspect]) assert.equal((await p(instance, "session", {})).status(), 200);
  const currentSession = (await prospect.cookies(publicSite)).find(({ name }) => name === "vel-explorer").value.split(".")[0];
  const otherSession = (await otherProspect.cookies(publicSite)).find(({ name }) => name === "vel-explorer").value.split(".")[0];
  assert.notEqual(currentSession, otherSession);
  assert.equal((await p(prospect, "auth", { action: "send", email })).status(), 200);
  assert.equal((await p(prospect, "auth", { action: "verify", email, code: fixtureCode, sessionId: otherSession })).status(), 200);
  assert.equal((await p(prospect, "auth", { action: "verify", email, code: fixtureCode })).status(), 400);
  const claimed = await sql`select session_id,user_id from velcrafting_private.prospect_contact`;
  assert.deepEqual(Array.from(claimed), [{ session_id: currentSession, user_id: id.prospect }]);
  assert.equal((await prospect.request.get(client + filePath)).status(), 404);
  assert.equal((await otherProspect.request.get(client + filePath)).status(), 404);
  assert.ok(auth.sends.every(({ shouldCreateUser }) => shouldCreateUser === false));

  const intakeNow = new Date().toISOString();
  const selectedBrief = { id:randomUUID(),version:1,createdAt:intakeNow,revisedAt:intakeNow,state:"in_progress",service:"review",
    fields:{
      outcome:{text:"Fictional visitor wants a better review handoff.",source:"visitor",confirmation:"stated",sourceMessageIds:[]},
      audience:{text:"FICTIONAL_EXAMPLE_DO_NOT_CONVERT",source:"fictional_example",confirmation:"suggested",sourceMessageIds:[]},
    }, scope:{level:"",breadth:"",readiness:"",audience:"",involvement:""},corrections:[],example:true };
  const savedBrief = await p(prospect,"brief",selectedBrief);
  assert.equal(savedBrief.status(),200);
  const share = await p(prospect,"booking",{idempotencyKey:randomUUID(),material:{state:"shared_for_booking",brief:await savedBrief.json()}});
  assert.equal(share.status(),201);
  const {intentId,confirmationVersion} = await share.json();
  await sql`insert into velcrafting_private.booking(uid,intent_id,confirmation_version,state,starts_at,time_zone,organizer,
    visitor_email,participants,calendar_id,event_uid,provider_updated_at)
    values('fixture-intake-booking',${intentId},${confirmationVersion},'confirmed',now()+interval '1 day',
      'UTC','issuer@workspace.example.invalid',${email},
      ${sql.json(["issuer@workspace.example.invalid",email])},'fixture-calendar','fixture-intake-event',now())`;
  // The booking record above is a local provider-observation fixture, not a Cal booking.
  await issuerPage.goto(client + "/staff/intake");
  assert.equal((await viewer.request.get(client + "/staff/intake")).status(),404);
  await issuerPage.getByRole("heading",{name:"Booking intake"}).waitFor();
  await issuerPage.getByRole("combobox",{name:/Confirmed booking/}).selectOption(intentId);
  await issuerPage.getByRole("combobox",{name:/Destination engagement/}).selectOption(id.alpha);
  await issuerPage.getByRole("button",{name:"Review shared brief"}).click();
  await issuerPage.getByText("Fictional visitor wants a better review handoff.",{exact:true}).waitFor();
  assert.equal(await issuerPage.getByText("FICTIONAL_EXAMPLE_DO_NOT_CONVERT").count(),0);
  await issuerPage.locator('input[value="outcome"]').check();
  const converted = issuerPage.waitForResponse((response) => response.url().endsWith("/api/consulting/workspace/intake"));
  await issuerPage.getByRole("button",{name:"Create private Discovery draft"}).click();
  assert.equal((await converted).status(),201);
  const {itemId: convertedItem} = await (await converted).json();
  assert.equal((await viewer.request.get(client + `/documents/${id.alpha}/${convertedItem}/1/download`)).status(),404);
  await issuerPage.getByRole("link",{name:"Open the engagement’s private drafts"}).waitFor();

  const chat = await context();
  const chatPage = await chat.newPage();
  await chatPage.goto(publicSite + "/consulting");
  await chatPage.getByRole("textbox",{name:"Message",exact:true}).fill(fixtureQuestion);
  assert.equal(await chatPage.getByRole("button",{name:"Send message"}).isDisabled(),true);
  assert.equal(providerCalls.length,0);
  await chatPage.getByRole("checkbox",{name:/read the recording notice/}).check();
  const sendRequest = chatPage.waitForRequest((request) => request.url().endsWith("/api/consulting/shaping") && request.method()==="POST");
  const reply = chatPage.waitForResponse((response) => response.url().endsWith("/api/consulting/shaping") && response.request().method()==="POST");
  await chatPage.getByRole("button",{name:"Send message"}).click();
  const original = (await sendRequest).postDataJSON();
  const answer = await reply;
  assert.equal(answer.status(),200,await answer.text());
  await chatPage.getByText("Who will own the handoff?",{exact:true}).waitFor();
  const result = await answer.json();
  assert.deepEqual(providerCalls,["deepseek/deepseek-v4.1-flash"]);
  assert.equal((await p(chat,"shaping",original)).status(),409);
  assert.equal(providerCalls.length,1);
  const [usage] = await sql`select u.provider_request_id,u.actual_model,u.cost_state,u.input_tokens,u.output_tokens,a.output_id
    from velcrafting_private.ai_usage_evidence u join velcrafting_private.ai_call_attempt a on a.id=u.attempt_id`;
  assert.deepEqual(usage,{ provider_request_id:"fiction-provider-receipt",actual_model:"deepseek/deepseek-v4.1-flash",
    cost_state:"unavailable",input_tokens:18,output_tokens:12,output_id:result.sourceMessageId });
  const now = new Date().toISOString();
  const snapshot = { id:randomUUID(),version:1,createdAt:now,revisedAt:now,state:"in_progress",service:"review",
    fields:{ questions:{text:"Name the owner after the handoff.",source:"model_suggestion",confirmation:"suggested",
      sourceMessageIds:[result.sourceMessageId]} },
    scope:{level:"",breadth:"",readiness:"",audience:"",involvement:""},corrections:[],example:false };
  assert.equal((await p(chat,"brief",snapshot)).status(),200);
  assert.equal((await p(otherProspect,"brief",snapshot)).status(),409);

  await sql`update velcrafting_private.client_membership set revoked_at=now() where user_id=${id.viewer}`;
  assert.equal((await viewer.request.get(client + filePath)).status(), 404);
  assert.equal((await viewer.request.get(client + ownExport)).status(), 404);
  assert.equal((await commercial.request.get(client + filePath)).status(), 200);

  const [database] = await sql`select current_setting('server_version') as version`;
  const receipt = {
    evidence: "Chromium with fixture Auth, Command Code HTTP stand-in and disposable native PostgreSQL",
    commit: gitHead.stdout.trim(), cleanCheckout: !gitStatus.stdout.trim(),
    appSnapshotSha256: snapshotHash.digest("hex"), schemaSha256: schemaHash.digest("hex"),
    node: process.version, chromium: browser.version(), postgres: database.version,
    artifacts: ["workspace-home-desktop.png", "workspace-engagement-mobile.png", "workspace-engagement-mobile-text-200.png"],
    checks: ["email code denial and verification", "home to engagement to downloaded private file", "tenant/phase and host isolation", "commercial export projection", "named setup from workflow template and explicit progress update", "staff authoring, exact preview, issue, private file upload and named agreement recording", "named draft and issue with conflict/retry", "200% root text scaling and reduced motion", "capability-bound prospect claim and replay denial", "revocation with an existing session", "actual shaping route committed before provider, usage persisted, duplicate suppressed and model provenance scoped", "exact shared booking revision converted into an unpublished Discovery draft"],
  };
  await writeFile(join(artifacts, "evidence.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ ...receipt, artifactDirectory: artifacts }));
} catch (error) {
  await writeFile(join(artifacts, "workspace-test-next.log"), log.join(""));
  throw error;
} finally {
  await browser?.close();
  if (app?.exitCode === null) {
    app.kill("SIGTERM");
    await once(app, "exit");
  }
  await Promise.all([auth?.close(), publicProxy ? close(publicProxy) : undefined, sql?.end({ timeout: 2 })]);
  if (started) await run("pg_ctl", "-D", data, "-m", "immediate", "-w", "stop");
  await rm(root, { recursive: true, force: true });
}
