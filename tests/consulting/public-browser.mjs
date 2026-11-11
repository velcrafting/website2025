import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = new URL(process.env.CONSULTING_BROWSER_ORIGIN ?? "http://127.0.0.1:3139");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname), "Use the local review server");
const out = process.env.CONSULTING_BROWSER_ARTIFACTS ?? await mkdtemp(join(tmpdir(), "velcrafting-public-browser-"));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CONSULTING_CHROMIUM_PATH ? { executablePath: process.env.CONSULTING_CHROMIUM_PATH } : {}),
  args: ["--disable-back-forward-cache"],
});

const saved = "Fictional saved context for Marisol Rivera";
const unsaved = "Fictional: Renée García needs intake & ownership help.";
const problem = (page) => page.getByRole("textbox", { name: "Problem or current context" });
const scheduling = (page) => page.getByRole("link", { name: "Choose a time on Cal.com (new tab)", exact: true });
const review = (page) => page.getByRole("button", { name: "Review & book meeting", exact: true }).click();
const next = (page) => page.getByRole("button", { name: "Continue", exact: true }).click();
const edit = (page) => page.getByRole("button", { name: "Edit answers", exact: true }).click();
async function save(page) {
  const disclosure = page.getByText("Download or share the full brief", { exact: true });
  if (!(await disclosure.evaluate((element) => element.parentElement.open))) await disclosure.click();
  await page.getByRole("button", { name: "Save brief", exact: true }).click();
}

async function openOptions(page) {
  const details = page.locator("details").filter({ has: page.getByText("More options", { exact: true }) });
  if (!(await details.evaluate((element) => element.open))) await details.locator(":scope > summary").click();
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const externalRequests = [];
  const fontRequests = [];
  const blockedRequests = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "cal.com") {
      externalRequests.push({ url: url.href, referrer: route.request().headers().referer });
      await route.fulfill({ contentType: "text/html", body: "<title>Local scheduler stand-in</title><p>Fictional scheduling page</p>" });
    } else if (url.origin === base.origin && url.pathname.startsWith("/consulting-fonts/")) {
      fontRequests.push(url.pathname);
      assert.equal(url.search, "");
      assert.equal(route.request().postData(), null);
      await route.continue();
    } else if (url.origin !== base.origin) {
      blockedRequests.push(url.href);
      await route.abort();
    } else if (url.pathname === "/consulting-test-departure") {
      await route.fulfill({ contentType: "text/html", body: "<title>Departed consulting page</title>" });
    } else {
      await route.continue();
    }
  });

  const page = await context.newPage();
  await page.goto(new URL("/consulting?service=workflow", base).href);
  assert.equal(await page.getByRole("heading", { name: "How Velcrafting can help" }).count(), 0);
  await page.getByText("Services and selected work", { exact: true }).click();
  assert.ok(await page.getByRole("heading", { name: "How Velcrafting can help" }).isVisible());
  assert.ok(await page.getByText(/Based in Spring, Texas, serving The Woodlands and greater Houston, with remote engagements worldwide/).isVisible());
  assert.equal(new URL(await page.locator('link[rel="canonical"]').getAttribute("href")).pathname, "/consulting");
  await page.getByRole("link", { name: "Communications and knowledge" }).click();
  await page.waitForURL(new URL("/consulting?service=communications#explorer", base).href);
  assert.equal(await page.locator('select[name="service"]').inputValue(), "communications");
  await page.goto(new URL("/consulting?service=workflow", base).href);
  await page.screenshot({ path: join(out, "consulting-desktop.png"), caret: "initial", animations: "disabled" });
  await page.getByRole("radio", { name: "Discovery" }).focus();
  await page.keyboard.press("ArrowRight");
  assert.ok(await page.getByRole("radio", { name: "Quote" }).isChecked());
  assert.equal(await page.evaluate(() => document.activeElement?.id), "stage-quote");
  assert.ok(await page.getByRole("region", { name: "Quote" }).getByText("Quote outline").isVisible());
  for (const [id, artifact] of [
    ["delivery", "Handoff packet"], ["proposal", "Proposal"], ["updates", "Progress note"],
    ["start", "Kickoff checklist"], ["discovery", "Discussion brief"], ["delivery", "Handoff packet"],
  ]) {
    await page.locator(`label[for="stage-${id}"]`).click();
    const panel = page.locator(`[data-stage-panel="${id}"]`);
    assert.ok(await panel.getByText(artifact, { exact: true }).last().isVisible());
    assert.equal(await page.locator("[data-stage-panel]:visible").count(), 1);
  }
  await page.locator("#process").screenshot({
    path: join(out, "consulting-timeline-desktop.png"), caret: "initial", animations: "disabled",
  });

  const timelineIntake = page.locator("#process #explorer");
  assert.equal(await timelineIntake.count(), 1);
  assert.equal(await timelineIntake.getByRole("textbox").count(), 1);
  assert.equal(await scheduling(page).count(), 0);
  const activeColumns = page.locator('[data-stage-panel="delivery"] > div');
  const what = await activeColumns.first().boundingBox();
  const example = await activeColumns.last().boundingBox();
  const intake = await timelineIntake.boundingBox();
  assert.ok(what.x < example.x && example.x < intake.x, "The intake is the right column");
  assert.equal(await page.locator("#brief-editor").getByRole("textbox").count(), 1);
  await problem(page).fill(saved);
  await page.locator('label[for="stage-discovery"]').click();
  assert.equal(await problem(page).inputValue(), saved, "Switching timeline stages preserves the intake");
  await next(page);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "What would better look like?");
  await page.getByRole("textbox", { name: "Desired outcome" }).fill("Fictional outcome for the guided brief");
  assert.equal(await page.locator("#your-brief").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Download PDF" }).count(), 0);
  await page.locator("#process").screenshot({
    path: join(out, "consulting-guided-brief-desktop.png"), caret: "initial", animations: "disabled",
  });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  assert.equal(await problem(page).inputValue(), saved);
  await review(page);
  assert.equal(await page.locator("#brief-editor").getByRole("textbox").count(), 0);
  assert.ok(await page.locator("#your-brief").getByText("Fictional outcome for the guided brief", { exact: true }).isVisible());
  assert.equal(await page.getByRole("combobox", { name: "Service starting point" }).count(), 0);
  await page.locator("#explorer").screenshot({
    path: join(out, "consulting-brief-review-desktop.png"), caret: "initial", animations: "disabled",
  });
  await save(page);
  await page.getByText("Revision 1 saved.", { exact: true }).waitFor();
  await edit(page);
  await problem(page).fill(unsaved);
  assert.equal(await page.getByRole("button", { name: "Download PDF" }).count(), 0);
  assert.equal(await scheduling(page).count(), 0, "Send the problem from the review step");
  assert.equal(externalRequests.length, 0, "Review and draft edits send no Cal request");

  await review(page);
  assert.ok(await page.getByText(/Your problem goes in the Cal.com booking link/).isVisible());
  assert.equal(await page.getByRole("link", { name: "Open email" }).count(), 0);
  assert.equal(externalRequests.length, 0, "Opening review sends no Cal request");
  const calPage = context.waitForEvent("page");
  await scheduling(page).click();
  const popup = await calPage;
  await popup.getByText("Fictional scheduling page").waitFor();
  assert.equal(new URL(page.url()).pathname, "/consulting");
  assert.equal(await popup.evaluate(() => window.opener), null);
  assert.equal(externalRequests.length, 1);
  const sent = new URL(externalRequests[0].url);
  assert.equal(sent.origin + sent.pathname, "https://cal.com/spajewski/30min");
  assert.deepEqual([...sent.searchParams], [["notes", unsaved]]);
  assert.equal(externalRequests[0].referrer, undefined);
  await popup.close();
  await edit(page);

  async function checkRestored() {
    await problem(page).waitFor();
    assert.equal(await problem(page).inputValue(), unsaved);
    await review(page);
    await openOptions(page);
    const savedSummary = page.getByText("See saved revision", { exact: true });
    if (!(await savedSummary.evaluate((element) => element.parentElement.open))) await savedSummary.click();
    assert.ok(await page.getByText(`Visitor stated: ${saved}`, { exact: true }).isVisible());
    assert.equal(await page.locator('select[name="service"]').inputValue(), "workflow");
    assert.equal(await page.getByRole("button", { name: "Download PDF" }).count(), 0);
    await edit(page);
  }

  await checkRestored();
  await page.reload();
  await checkRestored();
  const oldDocument = await page.evaluate(() => performance.timeOrigin);
  await page.goto(new URL("/consulting-test-departure", base).href);
  await page.goBack();
  assert.notEqual(await page.evaluate(() => performance.timeOrigin), oldDocument, "Back loaded a fresh document");
  await checkRestored();

  const otherTab = await context.newPage();
  await otherTab.goto(new URL("/consulting", base).href);
  assert.equal(await problem(otherTab).inputValue(), "");
  await problem(otherTab).fill(" \t\n ");
  await next(otherTab);
  await otherTab.getByRole("textbox", { name: "Desired outcome" }).fill("Another tab, another outcome");
  await next(otherTab);
  await otherTab.reload();
  await otherTab.getByRole("textbox", { name: "Audience" }).waitFor();
  await next(otherTab);
  await review(otherTab);
  assert.ok(await otherTab.getByText("Describe your problem to save the brief or book a call.").isVisible());
  assert.equal(await scheduling(otherTab).count(), 0);
  assert.equal(await otherTab.getByRole("button", { name: "Save brief", exact: true }).count(), 0);
  assert.equal(await otherTab.getByRole("button", { name: "Download PDF" }).count(), 0);
  await openOptions(otherTab);
  await otherTab.getByText("Add more context or scope choices", { exact: true }).click();
  await otherTab.getByRole("combobox", { name: "Delivery level" }).selectOption("Prototype");
  await otherTab.getByRole("button", { name: "Add your problem" }).click();
  await problem(otherTab).fill("A new request has no owner.");
  assert.equal(await scheduling(otherTab).count(), 0);
  await next(otherTab);
  assert.equal(await otherTab.getByRole("textbox", { name: "Desired outcome" }).inputValue(), "Another tab, another outcome");
  await review(otherTab);
  assert.ok(await scheduling(otherTab).isVisible());
  await save(otherTab);
  await otherTab.getByText("Revision 1 saved.", { exact: true }).waitFor();
  await openOptions(otherTab);
  await otherTab.getByText("See saved revision", { exact: true }).click();
  assert.ok(await otherTab.getByText(/Delivery level: Prototype/).isVisible());
  await edit(otherTab);
  await problem(otherTab).fill("");
  assert.equal(await scheduling(otherTab).count(), 0);
  await review(otherTab);
  assert.equal(await otherTab.getByRole("button", { name: "Download PDF" }).count(), 0);
  await otherTab.close();

  await review(page);
  await save(page);
  await page.getByText("Revision 2 saved.", { exact: true }).waitFor();
  const unicode = "Fictional names for Andre\u0301, 山田花子, and प्रिया कृष्णा.";
  const markup = '<img src="https://external.invalid/brief">';
  const blockedBeforePdf = blockedRequests.length;
  await edit(page);
  await problem(page).fill(`${unicode}\n${markup}`);
  await review(page);
  await save(page);
  await page.getByText("Revision 3 saved.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Open email" }).getAttribute("href"), "mailto:steven@velcrafting.com");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const pdf = await downloaded;
  assert.equal(pdf.suggestedFilename(), "velcrafting-brief-v3.pdf");
  const pdfFile = join(out, "fictional-browser-brief-v3.pdf");
  await pdf.saveAs(pdfFile);
  const extracted = execFileSync("pdftotext", ["-raw", "-enc", "UTF-8", pdfFile, "-"], { encoding: "utf8" });
  assert.ok(extracted.includes(unicode), extracted);
  assert.ok(extracted.includes(markup), extracted);
  assert.equal(blockedRequests.length, blockedBeforePdf, "Export attempted no external requests");
  assert.match(extracted, /v3 · .* · In progress/);
  await writeFile(join(out, "fictional-browser-brief-v3.txt"), extracted);
  assert.deepEqual(fontRequests, [
    "/consulting-fonts/NotoSans-Regular.ttf",
    "/consulting-fonts/NotoSansJP-Regular.otf",
    "/consulting-fonts/NotoSansDevanagari-Regular.ttf",
  ]);
  const legacySample = await page.evaluate(() => {
    const desk = JSON.parse(sessionStorage.getItem("velcrafting.consulting.desk.v1"));
    desk.example = "software";
    desk.brief.example = true;
    desk.brief.fields.problem.source = "fictional_example";
    return JSON.stringify(desk);
  });
  const legacyTab = await context.newPage();
  await legacyTab.addInitScript((value) => sessionStorage.setItem("velcrafting.consulting.desk.v1", value), legacySample);
  await legacyTab.goto(new URL("/consulting?service=workflow", base).href);
  await legacyTab.getByRole("button", { name: "Add your problem" }).waitFor();
  assert.equal(await scheduling(legacyTab).count(), 0);
  assert.equal(await legacyTab.getByRole("button", { name: "Download PDF" }).count(), 0);
  await legacyTab.close();

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.emulateMedia({ reducedMotion: "reduce" });
  await mobile.goto(new URL("/consulting", base).href);
  await mobile.screenshot({
    path: join(out, "consulting-services-mobile.png"), fullPage: true, caret: "initial", animations: "disabled",
  });
  await mobile.locator('label[for="stage-proposal"]').click();
  assert.ok(await mobile.locator('[data-stage-panel="proposal"]').getByText("Out of scope").isVisible());
  await mobile.locator("#process").screenshot({
    path: join(out, "consulting-timeline-mobile.png"), caret: "initial", animations: "disabled",
  });
  assert.equal(await mobile.locator("#process #explorer").getByRole("textbox").count(), 1);
  await mobile.locator("#explorer").scrollIntoViewIfNeeded();
  assert.equal(await mobile.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.locator("#explorer").screenshot({ path: join(out, "consulting-mobile.png") });
  const session = await context.newCDPSession(mobile);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await mobile.waitForFunction(() => window.visualViewport?.scale === 2);
  await mobile.screenshot({ path: join(out, "consulting-mobile-zoom-200.png") });

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  await noJs.route("**/*", (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  const staticPage = await noJs.newPage();
  await staticPage.goto(new URL("/consulting", base).href);
  await staticPage.locator('label[for="stage-proposal"]').click();
  assert.ok(await staticPage.getByRole("radio", { name: "Proposal" }).isChecked());
  assert.ok(await staticPage.locator('[data-stage-panel="proposal"]').getByText("Out of scope").isVisible());
  assert.equal(await scheduling(staticPage).count(), 0);
  assert.ok(await staticPage.getByText(/brief and scheduling require JavaScript/).isVisible());

  const noStorage = await context.newPage();
  await noStorage.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Blocked in test", "SecurityError"); } });
  });
  await noStorage.goto(new URL("/consulting", base).href);
  await noStorage.getByText(/Browser storage is unavailable/).waitFor();
  await problem(noStorage).fill(unsaved);
  assert.equal(await problem(noStorage).inputValue(), unsaved);

  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim();
  await writeFile(join(out, "receipt.json"), JSON.stringify({
    commit,
    cleanCheckout: status === "",
    chromium: browser.version(),
    target: base.origin,
    services: "local and remote coverage, canonical URL, and a service link opening the matching brief",
    process: "all six deliverables, arrow-key navigation, mobile selection, and selection without JavaScript",
    guide: "intake open by default in the third column, stays mounted across stages, supports skipping and refresh",
    scheduling: "blank, whitespace, and legacy samples block booking; explicit Cal navigation sends only the encoded problem; exact PDF shared separately",
    backForwardCache: "disabled; verified fresh document",
    zoom: "Chromium visual viewport scale 2",
    pdf: "browser download of revision 3; Poppler extracted exact multilingual text",
  }, null, 2) + "\n");
  console.log(`Public browser checks passed. Fictional artifacts: ${out}`);
} finally {
  await browser.close();
}
