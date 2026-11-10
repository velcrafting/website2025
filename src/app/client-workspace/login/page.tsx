import CodeForm from "./CodeForm";
import { authSettings } from "@/consulting/server/auth-settings";
import { SITE } from "@/config/site";

export default function WorkspaceLogin() {
  return <section>
    <h1>Welcome back.</h1>
    <p className="mt-3">Enter your email to continue.</p>
    {authSettings("client") ? <CodeForm /> : <p className="mt-4">Client sign-in is unavailable.</p>}
    <p className="mt-4"><a href={`mailto:${SITE.email}`}>Get help with access</a></p>
  </section>;
}
