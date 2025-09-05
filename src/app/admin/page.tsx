// src/app/admin/page.tsx
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <ul className="list-disc pl-5">
        <li>
          <a href="/admin/new" className="text-blue-600 hover:underline">New Article</a>
        </li>
        <li>
          <a href="/admin/newsletter" className="text-blue-600 hover:underline">Newsletter</a>
        </li>
      </ul>
    </div>
  );
}