import { isClientHost } from "./request-boundary";

const namespace = "/client-workspace";

export function clientRoute(host: string | null, pathname: string) {
  // Every private page/download rechecks identity. Alternate hosts cannot enter the namespace.
  if (pathname === namespace || pathname.startsWith(namespace + "/")) {
    return { kind: isClientHost(host) ? "pass" : "deny" } as const;
  }
  if (!isClientHost(host)) return { kind: "pass" } as const;
  if ((pathname === "/api/consulting/auth" || pathname === "/api/consulting/workspace" || pathname === "/api/consulting/workspace/files") || pathname === "/logo.svg" || pathname === "/favicon.ico") {
    return { kind: "pass" } as const;
  }
  if (pathname === "/" || pathname === "/login" ||
    /^\/(engagements|projects|clients|files|documents|staff)(\/|$)/.test(pathname)) {
    return { kind: "rewrite", path: pathname === "/" ? namespace : namespace + pathname } as const;
  }
  return { kind: "deny" } as const;
}
