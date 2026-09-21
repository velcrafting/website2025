import assert from "node:assert/strict";

import {
  CHANGE_PATH_CHOICE,
  INITIAL_CHOICES,
  resolveGuideChoice,
} from "../../src/components/guided-chat/content.ts";

const initialIds = INITIAL_CHOICES.map((choice) => choice.id);
assert.deepEqual(initialIds, ["hiring", "project", "exploring", "community"]);

const hiring = resolveGuideChoice("hiring");
assert.deepEqual(
  hiring.destinations.map((destination) => destination.id),
  ["resume", "booking", "projects"],
);
assert.equal(hiring.destinations.some((destination) => destination.href === "/Steven_Pajewski_Resume.pdf"), true);
assert.equal(hiring.destinations.some((destination) => destination.href === "https://cal.com/spajewski/30min"), true);
assert.deepEqual(
  hiring.choices.map((choice) => choice.id),
  ["technical", "communications", "ai-implementation", "change-path"],
);
assert.equal(hiring.destinations.find((destination) => destination.id === "booking")?.description, "Choose a time for a 30-minute conversation.");

assert.match(resolveGuideChoice("technical").message, /five dealerships/);
assert.match(resolveGuideChoice("communications").message, /Defensive Communications/);
assert.match(resolveGuideChoice("ai-implementation").message, /AI tutor-agent/);

const project = resolveGuideChoice("project");
assert.equal(project.destinations.some((destination) => destination.href === "/projects"), true);
assert.equal(project.destinations.some((destination) => destination.href === "/connect"), true);

const exploring = resolveGuideChoice("exploring");
assert.deepEqual(
  exploring.destinations.map((destination) => destination.href),
  ["/projects", "/blog", "/tools"],
);

const community = resolveGuideChoice("community");
const discord = community.destinations.find((destination) => destination.id === "discord");
assert.equal(discord?.unavailable, true);
assert.equal(discord?.href, undefined);
assert.equal(community.choices[0].id, CHANGE_PATH_CHOICE.id);

console.log("guided-chat content: ok");
