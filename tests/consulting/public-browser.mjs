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
const unsaved = "Fictional unsaved follow-up for Renée García";
const problem = (page) => page.getByRole("textbox", { name: "Problem or current context" });
const scheduling = (page) => page.getByRole("link", { name: "Open scheduling on Cal.com (new tab)" });

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

  await page.getByRole("link", { name: "Start with your own problem" }).click();
  assert.equal(new URL(page.url()).hash, "#explorer");
  assert.equal(await page.locator("#brief-editor").getByRole("textbox").count(), 1);
  await problem(page).fill(saved);
  await page.getByRole("button", { name: "Next: outcome" }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "What would better look like?");
  await page.getByRole("textbox", { name: "Desired outcome" }).fill("Fictional outcome for the guided brief");
  assert.ok(await page.locator("#your-brief").getByText("Fictional outcome for the guided brief", { exact: true }).isVisible());
  await page.locator("#explorer").screenshot({
    path: join(out, "consulting-guided-brief-desktop.png"), caret: "initial", animations: "disabled",
  });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  assert.equal(await problem(page).inputValue(), saved);
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await page.getByText("Revision 1 saved.", { exact: true }).waitFor();
  await problem(page).fill(unsaved);
  assert.ok(await page.getByRole("button", { name: "Download PDF" }).isDisabled());

  const calPage = context.waitForEvent("page");
  await scheduling(page).click();
  const popup = await calPage;
  await popup.getByText("Fictional scheduling page").waitFor();
  assert.equal(new URL(page.url()).pathname, "/consulting");
  assert.equal(await popup.evaluate(() => window.opener), null);
  assert.deepEqual(externalRequests, [{ url: "https://cal.com/spajewski/30min", referrer: undefined }]);
  await popup.close();

  async function checkRestored() {
    await page.getByText("Unsaved changes. Save a revision before exporting.", { exact: true }).waitFor();
    assert.equal(await problem(page).inputValue(), unsaved);
    const savedDetails = page.locator("#your-brief details");
    if (!(await savedDetails.evaluate((element) => element.open))) await savedDetails.locator("summary").click();
    assert.ok(await page.getByText(`Visitor stated: ${saved}`, { exact: true }).isVisible());
    assert.equal(await page.locator('select[name="service"]').inputValue(), "workflow");
    assert.ok(await page.getByRole("button", { name: "Download PDF" }).isDisabled());
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
  await otherTab.getByRole("button", { name: "Save draft revision" }).waitFor();
  assert.equal(await problem(otherTab).inputValue(), "");
  await otherTab.getByRole("button", { name: "Next: outcome" }).click();
  await otherTab.getByRole("textbox", { name: "Desired outcome" }).fill("Another tab, another outcome");
  await otherTab.getByRole("button", { name: "Next: people" }).click();
  await otherTab.reload();
  await otherTab.getByRole("textbox", { name: "Audience" }).waitFor();
  await otherTab.getByRole("button", { name: "Next: constraints" }).click();
  await otherTab.getByRole("button", { name: "Review brief" }).click();
  await otherTab.getByText("Add more context or scope choices", { exact: true }).click();
  await otherTab.getByRole("combobox", { name: "Delivery level" }).selectOption("Prototype");
  await otherTab.getByRole("navigation", { name: "Brief steps" }).getByRole("button", { name: "Outcome" }).click();
  assert.equal(await otherTab.getByRole("textbox", { name: "Desired outcome" }).inputValue(), "Another tab, another outcome");
  await otherTab.getByRole("button", { name: "Save draft revision" }).click();
  await otherTab.getByText("Revision 1 saved.", { exact: true }).waitFor();
  await otherTab.getByText("See saved revision", { exact: true }).click();
  assert.ok(await otherTab.getByText(/Delivery level: Prototype/).isVisible());
  await otherTab.close();

  await page.getByRole("button", { name: "Save draft revision" }).click();
  await page.getByText("Revision 2 saved.", { exact: true }).waitFor();
  const unicode = "Fictional names for Andre\u0301, 山田花子, and प्रिया कृष्णा.";
  const markup = '<img src="https://external.invalid/brief">';
  const blockedBeforePdf = blockedRequests.length;
  await problem(page).fill(`${unicode}\n${markup}`);
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await page.getByText("Revision 3 saved.", { exact: true }).waitFor();
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
  await mobile.getByRole("link", { name: "Start with your own problem" }).click();
  await mobile.locator("#explorer").scrollIntoViewIfNeeded();
  assert.equal(await mobile.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: join(out, "consulting-mobile.png") });
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
  assert.equal(await scheduling(staticPage).getAttribute("target"), "_blank");

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
    guide: "timeline entry, one question at a time, live preview, back, skip, refresh, and optional scope",
    scheduling: "intercepted Cal link; no provider booking",
    backForwardCache: "disabled; verified fresh document",
    zoom: "Chromium visual viewport scale 2",
    pdf: "browser download of revision 3; Poppler extracted exact multilingual text",
  }, null, 2) + "\n");
  console.log(`Public browser checks passed. Fictional artifacts: ${out}`);
} finally {
  await browser.close();
}
