// src/app/admin/login/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  const error = searchParams?.error;
  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Admin Login</h1>
      {error && <p className="mb-4 text-sm text-red-600">Invalid credentials</p>}
      <form action={login} className="space-y-4">
        <input
          type="text"
          name="username"
          placeholder="Username"
          className="w-full rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          className="w-full rounded border px-3 py-2"
          required
        />
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">Login</button>
      </form>
    </div>
  );
}

async function login(formData: FormData) {
  "use server";
  const user = formData.get("username")?.toString();
  const pass = formData.get("password")?.toString();
  const { ADMIN_USERNAME, ADMIN_KEY } = process.env;
  if (user === ADMIN_USERNAME && pass === ADMIN_KEY) {
    const store = await cookies();
    store.set("admin", ADMIN_KEY!, { httpOnly: true, path: "/", sameSite: "lax" });
    redirect("/admin");
  }
  redirect("/admin/login?error=1");
}