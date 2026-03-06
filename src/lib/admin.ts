// src/lib/admin.ts
import { cookies } from "next/headers";

const ADMIN_COOKIE = "admin";

export async function isAdmin() {
  const key = process.env.ADMIN_KEY;
  const store = await cookies();
  const cookie = store.get(ADMIN_COOKIE)?.value;
  return Boolean(key && cookie && cookie === key);
}

export async function requireAdmin() {
  if (!(await isAdmin())) {
    throw new Error("Unauthorized");
  }
}