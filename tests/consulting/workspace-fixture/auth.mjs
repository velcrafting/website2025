import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";

export const fixtureCode = "246810";

export async function fixtureAuth(identities) {
  const users = new Map(Object.entries(identities).map(([name, id]) => {
    const email = `${name.toLowerCase()}@workspace.example.invalid`;
    return [email, { id, email, aud: "authenticated", role: "authenticated", email_confirmed_at: new Date(0).toISOString(), user_metadata: {}, app_metadata: {} }];
  }));
  const tokens = new Map();
  const pending = new Set();
  const sends = [];
  const jwtSecret = randomBytes(32);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    const respond = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const badCode = () => respond(403, { message: "Fixture OTP invalid or expired", code: "otp_expired" });
    if (path === "/auth/v1/health") return respond(200, { fixture: true });
    if (path === "/auth/v1/user") {
      const user = tokens.get(bearer);
      return user ? respond(200, user) : respond(401, { message: "Fixture user not found", code: "session_not_found" });
    }
    if (path === "/auth/v1/logout") {
      tokens.delete(bearer);
      return respond(200, {});
    }
    if (path === "/auth/v1/.well-known/jwks.json") return respond(200, { keys: [] });
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (path === "/auth/v1/otp") {
        sends.push({ email: body.email, shouldCreateUser: body.create_user });
        if (body.create_user !== false || !users.has(body.email)) return badCode();
        pending.add(body.email);
        return respond(200, {});
      }
      if (path === "/auth/v1/verify") {
        const user = users.get(body.email);
        if (!user || body.token !== fixtureCode || !pending.delete(body.email)) return badCode();
        const now = Math.floor(Date.now() / 1000);
        const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
        const unsigned = `${encode({ typ: "JWT", alg: "HS256" })}.${encode({ sub: user.id, aud: user.aud, exp: now + 3600, iat: now })}`;
        const access_token = `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
        tokens.set(access_token, user);
        return respond(200, { access_token, refresh_token: randomBytes(16).toString("hex"), expires_in: 3600, token_type: "bearer", user });
      }
    } catch {
      return respond(400, { message: "Malformed fixture request" });
    }
    return respond(404, { message: "Fixture endpoint not found" });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`, sends,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
