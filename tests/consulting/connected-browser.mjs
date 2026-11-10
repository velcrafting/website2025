import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = new URL(process.env.CONSULTING_CONNECTED_BROWSER_ORIGIN ?? "http://127.0.0.1:3141");
assert.equal(base.hostname, "127.0.0.1", "Use a loopback fixture server");
const browser = await chromium.launch(process.env.CONSULTING_CHROMIUM_PATH
  ? { executablePath: process.env.CONSULTING_CHROMIUM_PATH } : {});
const message = "Fictional visitor asks for help clarifying this project.";
const visitor = "fixture-visitor@example.invalid";
const organizer = "fixture-owner@example.invalid";
const operation = "9a2f1190-53d7-480f-ada2-683fc8d43990";
const source = "1556222d-f182-4a24-8492-47b938ad98e2";
const intent = "38453da2-b754-44b3-b801-a5b4d7017133";
const correlation = "608537b7-4c63-4fc4-95f5-d65f41e888a2";
const sha256 = "a".repeat(64);
let verified = false;
let snapshot = null;
let bookingStatus = null;
const shapeRequests = [];
const bookingRequests = [];
const briefRequests = [];
const authRequests = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort();
    if (!url.pathname.startsWith("/api/consulting/")) return route.continue();
    const response = (json, status = 200) => route.fulfill({ status, json });
    const data = request.method() === "GET" ? null : request.postDataJSON();
    switch (url.pathname) {
      case "/api/consulting/session": return response({ ready: true });
      case "/api/consulting/auth":
        authRequests.push(data);
        if (data.action === "send") return response({ ok: true, message: "Fictional code sent." });
        if (data.action === "verify" && data.code === "123456") {
          verified = true;
          return response({ ok: true });
        }
        return response({ error: "Invalid fixture code" }, 400);
      case "/api/consulting/brief":
        if (request.method() === "GET") return verified ? response({ brief: snapshot, verifiedEmail: visitor }) : response({ error: "Not found" }, 404);
        briefRequests.push(data);
        snapshot = data;
        return response({ id: data.id, version: data.version, sha256 });
      case "/api/consulting/shaping":
        shapeRequests.push(data);
        if (shapeRequests.length === 1) return response({ error: "Fictional connection interrupted" }, 503);
        return response({ operationId: operation, sourceMessageId: source, reply: "What would a useful first milestone look like?",
          suggestions: [{ field: "problem", text: "A conflicting fictional description" }, { field: "outcome", text: "A measured fictional milestone" }] });
      case "/api/consulting/booking":
        if (request.method() === "DELETE") {
          bookingStatus.revoked = true;
          return response({ revoked: true });
        }
        if (request.method() === "GET") return url.searchParams.has("intentId") ? response(bookingStatus) : response({ organizer });
        bookingRequests.push(data);
        bookingStatus = { intentId: intent, confirmationVersion: 1, revoked: false, expired: false,
          material: data.material.state, briefVersion: data.material.brief?.version ?? null,
          bookingState: null, preparationState: null, startsAt: null, timeZone: null, meetUrl: null };
        return response({ intentId: intent, confirmationVersion: 1, schedulingUrl: bookingRequests.length === 1
          ? "https://example.invalid/unsafe" : `https://cal.com/spajewski/30min?velcraftingIntent=${correlation}` }, 201);
      default: return response({ error: "Unexpected fixture route" }, 500);
    }
  });

  const page = await context.newPage();
  const initial = await page.goto(new URL("/consulting", base).href);
  assert.ok(!(await initial.text()).includes(organizer), "Do not expose the organizer in anonymous page props");
  const problem = page.getByRole("textbox", { name: "Problem or current context" });
  await problem.fill("Fictional visitor’s own description.");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await page.getByText("Revision 1 saved.", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(message);
  assert.ok(await page.getByRole("button", { name: "Send message" }).isDisabled());
  assert.equal(shapeRequests.length, 0);
  await page.getByText(/including unfinished conversations/).waitFor();
  await page.getByRole("checkbox", { name: /read the recording notice/ }).check();
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Fictional connection interrupted", { exact: true }).waitFor();
  assert.equal(shapeRequests.length, 1);
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("What would a useful first milestone look like?", { exact: true }).waitFor();
  assert.equal(shapeRequests.length, 2);
  assert.equal(shapeRequests[0].idempotencyKey, shapeRequests[1].idempotencyKey);
  assert.deepEqual(shapeRequests[0], { idempotencyKey: shapeRequests[1].idempotencyKey,
    notice: "consulting-ai-recording-v1", message, brief: null });
  assert.ok(await page.getByRole("button", { name: "Add suggestion to Problem or current context" }).isDisabled());
  await page.getByRole("textbox", { name: "Constraints" }).fill("Fictional pending correction");
  const apply = page.getByRole("button", { name: "Add suggestion to Desired outcome" });
  assert.ok(await apply.isDisabled(), "Do not replace even unrelated unsaved work");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await apply.click();
  await page.getByText("Suggestion saved in revision 3.", { exact: true }).waitFor();
  await page.getByText("AI suggestion: A measured fictional milestone", { exact: true }).waitFor();
  assert.equal(await problem.inputValue(), "Fictional visitor’s own description.");

  await page.getByRole("textbox", { name: "Email address" }).fill(visitor);
  await page.getByRole("button", { name: "Send a code" }).click();
  await page.getByRole("textbox", { name: "Email code" }).fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByText(`Verified for this exploration: ${visitor}.`).waitFor();
  await page.getByText(new RegExp(organizer)).waitFor();
  assert.deepEqual(authRequests.map(({ action, email }) => [action, email]), [["send", visitor], ["verify", visitor]]);
  await page.getByRole("button", { name: "Save selected revision online" }).click();
  await page.getByText("Revision 3 saved to this verified exploration.").waitFor();
  assert.deepEqual(snapshot.fields.outcome, { text: "A measured fictional milestone",
    source: "model_suggestion", confirmation: "suggested", sourceMessageIds: [source] });
  assert.equal(snapshot.fields.constraints.text, "Fictional pending correction");

  const other = await context.newPage();
  await other.goto(new URL("/consulting", base).href);
  await other.getByRole("button", { name: "Restore online revision 3" }).click();
  await other.getByText("Online revision 3 restored.").waitFor();
  assert.equal(await other.getByRole("textbox", { name: "Desired outcome" }).inputValue(), "A measured fictional milestone");
  await other.close();

  const confirm = page.getByRole("button", { name: "Confirm sharing choice" });
  await page.getByRole("radio", { name: "Share saved brief revision 3 and prepared notes" }).check();
  assert.ok(await confirm.isDisabled());
  await page.getByRole("checkbox", { name: /authorize sharing this meeting material/ }).check();
  await confirm.click();
  await page.getByText("The scheduling link could not be verified.", { exact: true }).waitFor();
  const link = page.getByRole("link", { name: "Choose a time on Cal.com (new tab)" });
  assert.equal(await link.count(), 0);
  await confirm.click();
  await link.waitFor();
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.equal(await link.getAttribute("href"), `https://cal.com/spajewski/30min?velcraftingIntent=${correlation}`);
  assert.equal(bookingRequests[0].idempotencyKey, bookingRequests[1].idempotencyKey);
  assert.deepEqual(bookingRequests[1].material, { state: "shared_for_booking", brief: { id: snapshot.id, version: 3, sha256 } });

  bookingStatus.bookingState = "confirmed";
  bookingStatus.preparationState = "ready";
  bookingStatus.startsAt = "2026-11-11T16:00:00.000Z";
  bookingStatus.timeZone = "America/Chicago";
  bookingStatus.meetUrl = "https://meet.google.com/abc-defg-hij";
  await page.getByRole("button", { name: "Check booking status" }).click();
  await page.getByText("Meeting booked. Materials ready.", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Open Google Meet" }).waitFor();
  await page.getByRole("button", { name: "Withdraw sharing permission" }).click();
  await page.getByText("Sharing permission withdrawn.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Open Google Meet" }).count(), 0);
  const uploads = briefRequests.length;
  await page.getByRole("radio", { name: "Continue without a brief and prepare notes only" }).check();
  await page.getByRole("checkbox", { name: /authorize sharing this meeting material/ }).check();
  await confirm.click();
  await link.waitFor();
  assert.deepEqual(bookingRequests[2].material, { state: "no_brief_confirmed", brief: null });
  assert.equal(briefRequests.length, uploads);
  console.log("Connected consulting browser flow passed with all consulting APIs intercepted. No provider request, email or booking occurred.");
} finally {
  await browser.close();
}
