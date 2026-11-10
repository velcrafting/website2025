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
  await page.screenshot({ path: join(out, "consulting-desktop.png") });
  const stage = page.locator("summary").filter({ hasText: /^Delivery$/ });
  await stage.focus();
  await page.keyboard.press("Enter");
  assert.ok(await stage.evaluate((summary) => summary.parentElement.open));
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Delivery");

  await problem(page).fill(saved);
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
    assert.ok(await page.getByText(`Visitor stated: ${saved}`, { exact: true }).isVisible());
    assert.equal(await page.getByRole("combobox", { name: "Service starting point" }).inputValue(), "workflow");
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
  await mobile.getByRole("link", { name: "Explore your project" }).click();
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
  await staticPage.locator("summary").filter({ hasText: /^Proposal$/ }).click();
  assert.ok(await staticPage.locator("summary").filter({ hasText: /^Proposal$/ }).evaluate((summary) => summary.parentElement.open));
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
    scheduling: "intercepted Cal link; no provider booking",
    backForwardCache: "disabled; verified fresh document",
    zoom: "Chromium visual viewport scale 2",
    pdf: "browser download of revision 3; Poppler extracted exact multilingual text",
  }, null, 2) + "\n");
  console.log(`Public browser checks passed. Fictional artifacts: ${out}`);
} finally {
  await browser.close();
}
