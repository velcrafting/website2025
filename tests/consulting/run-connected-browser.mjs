import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";

const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const { port } = socket.address();
socket.close();
await once(socket, "close");
const origin = `http://127.0.0.1:${port}`;
const safe = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(VELCRAFTING_|COMMAND_CODE_|CLIENT_SITE_ORIGIN$|PUBLIC_SITE_ORIGIN$)/.test(key)));
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  stdio: ["ignore","pipe","pipe"],
  env: { ...safe, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PUBLIC_SITE_ORIGIN: origin,
    VELCRAFTING_EXPLORER_ENABLED: "1", VELCRAFTING_RUNTIME_DATABASE_URL: "",
    VELCRAFTING_PROSPECT_AUTH_ENABLED: "1", VELCRAFTING_SUPABASE_URL: "https://fixture.example.invalid",
    VELCRAFTING_SUPABASE_PUBLISHABLE_KEY: "fixture-only", VELCRAFTING_AI_ENABLED: "1",
    VELCRAFTING_AI_MAINTENANCE_TOKEN: "fixture-only-not-a-live-token000000", VELCRAFTING_AI_PAYLOAD_RETENTION_HOURS: "1",
    COMMAND_CODE_API_KEY: "fixture-only", COMMAND_CODE_VERIFIED_MODEL: "deepseek/deepseek-v4.1-flash",
    VELCRAFTING_BOOKING_ENABLED: "1", VELCRAFTING_CAL_EVENT_TYPE_ID: "42",
    VELCRAFTING_BOOKING_OWNER_EMAIL: "fixture-owner@example.invalid",
  },
});
let log = "";
for (const stream of [app.stdout, app.stderr]) stream.on("data", (chunk) => { log = (log + chunk).slice(-12000); });
try {
  let ready = false;
  for (let retry = 0; retry < 120 && app.exitCode === null; retry++) {
    ready = await fetch(origin + "/consulting").then(({ok}) => ok, () => false);
    if (ready) break;
    await setTimeout(500);
  }
  if (!ready) throw new Error(`Loopback fixture server did not start:\n${log}`);
  const run = spawn(process.execPath, ["tests/consulting/connected-browser.mjs"], {
    stdio: "inherit", env: { ...safe, CONSULTING_CONNECTED_BROWSER_ORIGIN: origin },
  });
  const [code] = await once(run, "exit");
  process.exitCode = code ?? 1;
} finally {
  if (app.exitCode === null) app.kill("SIGTERM");
}
