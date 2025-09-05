#!/usr/bin/env node
// commit-content.mjs - commit content changes
import { execSync } from "child_process";

const msg = process.argv[2] || "Update content";
execSync("git add src/content", { stdio: "inherit" });
try {
  execSync(`git commit -m "${msg}"`, { stdio: "inherit" });
} catch {
  console.log("No changes to commit");
}