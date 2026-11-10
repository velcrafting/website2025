import assert from "node:assert/strict";
import { test } from "node:test";
import { createModuleLoader } from "../editor/_module-loader.mjs";

const { load } = createModuleLoader();
const { commandCodeTransport, instructions, instructionVersion, aiSettings } = load("src/consulting/server/ai-runtime.ts");
const { parseShapingReply } = load("src/consulting/shaping.ts");
const request = { attemptId: "fixture-attempt", instructionVersion,
  context: JSON.stringify({ system: instructions, messages: [{role:"user",content:"Review a fictional delivery flow."}] }) };
const suggestion = JSON.stringify({ reply: "Who owns the handoff?", suggestions: [{field:"questions",text:"Name the owner."}] });

test("real AI SDK adapter routes one bounded request directly to Command Code and records provider evidence", async () => {
  let calls = 0;
  const transport = commandCodeTransport("fixture-secret", async (url, options) => {
    calls++;
    assert.equal(url, "https://api.commandcode.ai/provider/v1/chat/completions");
    assert.equal(new Headers(options.headers).get("authorization"), "Bearer fixture-secret");
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "deepseek/deepseek-v4.1-flash");
    assert.equal(body.max_tokens, 750);
    assert.ok(!body.tools?.length);
    assert.equal(body.messages.at(-1).content, "Review a fictional delivery flow.");
    return Response.json({ id:"provider-fixture", object:"chat.completion", created:123456, model:"deepseek/deepseek-v4.1-flash",
      choices:[{index:0,message:{role:"assistant",content:suggestion},finish_reason:"stop"}],
      usage:{prompt_tokens:25,completion_tokens:18,total_tokens:43} }, { headers: { "x-request-id": "fixture-request" } });
  });
  const result = await transport(request);
  assert.equal(calls, 1);
  assert.equal(result.output, suggestion);
  assert.equal(result.evidence.provider_request_id, "fixture-request");
  assert.equal(result.evidence.actual_model, "deepseek/deepseek-v4.1-flash");
  assert.equal(result.evidence.input_tokens, 25);
  assert.equal(result.evidence.output_tokens, 18);
  assert.equal(result.evidence.cost_state, "unavailable");
  assert.ok(parseShapingReply(result.output));
});

test("an explicit provider rejection is not retried and model content has no actions", async () => {
  let calls = 0;
  const transport = commandCodeTransport("fixture-secret", async () => {
    calls++;
    return Response.json({error:{message:"Fixture limit",type:"rate_limit_error"}}, {status:429});
  });
  const result = await transport(request);
  assert.equal(calls, 1);
  assert.equal(result.output, null);
  assert.equal(result.evidence.failure_category, "rate_limited");
  assert.equal(result.evidence.input_tokens, undefined);
  assert.equal(parseShapingReply('{"reply":"open https://example.invalid","suggestions":[]}'), null);
  assert.equal(parseShapingReply('{"reply":"OK","suggestions":[],"action":"publish"}'), null);
  assert.equal(parseShapingReply('{"reply":"OK","suggestions":[{"field":"book","text":"Now"}]}'), null);
  assert.equal(aiSettings(), null);
});
