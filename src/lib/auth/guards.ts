import "server-only";
import { redirect } from "next/navigation";
import { getSession, isRecorderOrAdmin, isAdmin, isStaff, type Role, type Session } from "./session";

/** ต้อง login — ไม่งั้น redirect ไป /login */
export async function requireAuth(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await requireAuth();
  if (!roles.includes(s.role)) redirect("/");
  return s;
}

export async function requireStaff(): Promise<Session> {
  const s = await requireAuth();
  if (!isStaff(s.role)) redirect("/");
  return s;
}

export async function requireRecorderOrAdmin(): Promise<Session> {
  const s = await requireAuth();
  if (!isRecorderOrAdmin(s.role)) redirect("/");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireAuth();
  if (!isAdmin(s.role)) redirect("/");
  return s;
}

/** สำหรับ API route — คืน session หรือ throw HttpError */
export async function apiRequireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new ApiAuthError("กรุณาเข้าสู่ระบบ", 401);
  if (roles.length && !roles.includes(s.role))
    throw new ApiAuthError("ไม่มีสิทธิ์ดำเนินการนี้", 403);
  return s;
}

export class ApiAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
