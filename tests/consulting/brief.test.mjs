import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const { load } = createModuleLoader();
const { briefMarkdown, briefText, reviseBrief } = load("src/consulting/brief.ts");
const { briefPdf, briefPdfFontFiles } = load("src/consulting/pdf.ts");
const fonts = (name) => readFile(new URL(`../../public/consulting-fonts/${briefPdfFontFiles[name]}`, import.meta.url));
const { exampleBrief } = load("src/consulting/fixtures.ts");
const { parseExplorerBlock } = load("src/consulting/catalog.ts");
const stamp = { id: "fixture-brief", now: "2026-11-10T16:00:00.000Z" };

test("partial revisions retain provenance and reject stale edits", () => {
  const v1 = exampleBrief("software", stamp);
  const edit = { service: "build", fields: { problem: "Correction: two queues, not three." }, scope: v1.scope };
  const v2 = reviseBrief(v1, 1, edit, stamp);
  assert.throws(() => reviseBrief(v2, 1, edit, stamp), /brief changed/);
  assert.match(v1.fields.problem.text, /fictional/);
  assert.equal(v2.fields.problem.source, "visitor");
  assert.equal(v2.fields.questions.source, "fictional_example");
  assert.match(briefText(v2), /Audience\nNot yet known/);
  assert.notEqual(exampleBrief("communications", stamp).fields.questions.text, v1.fields.questions.text);
});

test("exports preserve the selected version, treating markup as text", async () => {
  const v1 = exampleBrief("communications", stamp);
  const problem = "Café (pilot) \\ ![tracking](https://example.invalid/pixel) <script>test</script>";
  const edit = { service: v1.service, fields: { problem }, scope: v1.scope, review: true };
  const v2 = reviseBrief(v1, 1, edit, stamp);
  assert.match(briefText(v2), /v2.*Reviewed by visitor/);
  assert.ok(briefText(v2).includes(problem));
  assert.doesNotMatch(briefMarkdown(v2), /<script>|!\[tracking\]\(https:\/\//);
  const bytes = Buffer.from(await briefPdf(v2, fonts));
  assert.ok(bytes.equals(Buffer.from(await briefPdf(v2, fonts))));
  assert.ok(!bytes.equals(Buffer.from(await briefPdf(v1, fonts))));
  for (const value of ["🙂", "مرحبا"]) {
    const unsupported = reviseBrief(v2, 2, { ...edit, fields: { problem: value } }, stamp);
    await assert.rejects(briefPdf(unsupported, fonts), /Download Markdown/);
    assert.ok(briefMarkdown(unsupported).includes(value));
  }
});

test("the explorer catalog rejects URLs, HTML, privileged actions and unknown properties", () => {
  for (const value of [
    { kind: "question", text: "https://example.invalid/" },
    { kind: "question", text: "<img>" },
    { kind: "question", text: "Where?", action: "confirm_booking_share" },
    { kind: "confirm_booking_share", text: "Share now" },
  ]) assert.equal(parseExplorerBlock(value), null);
  assert.equal(parseExplorerBlock({ kind: "question", text: "Who owns this?" })?.text, "Who owns this?");
});
