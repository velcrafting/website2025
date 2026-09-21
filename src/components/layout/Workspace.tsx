import type { PropsWithChildren } from "react";

export default function Workspace({ children }: PropsWithChildren) {
  return <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">{children}</main>;
}
