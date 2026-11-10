import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const { load } = createModuleLoader();
const { reviseBrief } = load("src/consulting/brief.ts");
const { briefPdf, briefPdfFontFiles } = load("src/consulting/pdf.ts");
const { exampleBrief } = load("src/consulting/fixtures.ts");
const out = process.env.CONSULTING_PDF_ARTIFACTS ?? await mkdtemp(join(tmpdir(), "velcrafting-public-pdf-"));
await mkdir(out, { recursive: true });
const time = { id: "fictional-pdf", now: "2026-11-10T16:00:00.000Z" };
const contents = {
  problem: "Marisol García, Andre\u0301 Kowalski, Łukasz Żak, Ευγενία Παππά, София Иванова.",
  audience: "山田花子の日本語テスト。 प्रिया कृष्णा हिन्दी फ़ाइल नमस्ते।",
  constraints: "Fictional long token starts\n" + "A9mR6vK".repeat(160) + "\nFictional long token ends",
  inputs: "One fictional context entry. ".repeat(40),
  dependencies: "Another fictional context entry. ".repeat(34),
  deliverables: "A fictional output for the selected revision. ".repeat(24),
  outcome: "Literal markup <img src=\"https://external.invalid/brief\"> <script>example</script>",
};

test("the exact multilingual revision renders and extracts across pages with embedded fonts", async () => {
  const initial = exampleBrief("communications", time);
  const selected = reviseBrief(initial, initial.version, { service: "communications", fields: contents, scope: initial.scope, review: true }, time);
  const loaded = [];
  const bytes = await briefPdf(selected, async (name) => {
    loaded.push(name);
    return readFile(new URL(`../../public/consulting-fonts/${briefPdfFontFiles[name]}`, import.meta.url));
  });
  assert.deepEqual(loaded, ["standard", "japanese", "devanagari"]);
  const pdf = join(out, "fictional-consulting-brief-v2.pdf");
  await writeFile(pdf, bytes);
  function pdfTool(program, args) {
    const result = spawnSync(program, args, { encoding: "utf8" });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "", `${program} reported a PDF syntax warning`);
    return result.stdout;
  }
  const info = pdfTool("pdfinfo", [pdf]);
  const pageCount = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
  assert.ok(pageCount >= 2, info);
  assert.match(info, /^Tagged:\s+yes$/m);
  assert.match(info, /^JavaScript:\s+no$/m);
  const fonts = pdfTool("pdffonts", [pdf]);
  const fontRows = fonts.trimEnd().split("\n").slice(2);
  assert.equal(fontRows.length, 3, fonts);
  assert.ok(fontRows.every((row) => /yes\s+yes\s+yes\s+\d+\s+\d+\s*$/.test(row)), fonts);
  const text = pdfTool("pdftotext", ["-raw", "-enc", "UTF-8", pdf, "-"]);
  await writeFile(join(out, "fictional-consulting-brief-v2.txt"), text);
  assert.match(text, /v2 · 2026-11-10T16:00:00\.000Z · Reviewed by visitor/);
  const flatten = (s) => s.replace(/\s+/g, " ").trim();
  assert.ok(flatten(text).includes(contents.problem), text);
  assert.ok(flatten(text).includes(contents.audience), text);
  assert.ok(flatten(text).includes(contents.outcome), text);
  const token = text.match(/Fictional long token starts\s+([\s\S]+?)\s+Fictional long token ends/);
  assert.equal(token?.[1].replace(/\s/g, ""), "A9mR6vK".repeat(160));
  assert.ok(!text.includes(initial.fields.problem.text));
  pdfTool("pdftoppm", ["-png", "-r", "100", pdf, join(out, "fictional-consulting-brief-v2")]);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim();
  await writeFile(join(out, "receipt.json"), JSON.stringify({
    commit, cleanCheckout: status === "", pages: pageCount, embeddedUnicodeFonts: fontRows.length,
  }, null, 2) + "\n");
  console.log(`Fictional PDF artifacts: ${out}`);
});
