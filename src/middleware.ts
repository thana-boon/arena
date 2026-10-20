import { NextResponse, type NextRequest } from "next/server";
import { verifyToken, applyViewAs, SESSION_COOKIE, VIEW_AS_COOKIE_NAME, type Role } from "@/lib/auth/session";

// route prefix → allowed roles
const RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/teacher", roles: ["teacher", "recorder", "admin"] },
  { prefix: "/student", roles: ["student"] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = RULES.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const raw = token ? await verifyToken(token) : null;
  const session = raw ? applyViewAs(raw, req.cookies.get(VIEW_AS_COOKIE_NAME)?.value) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!rule.roles.includes(session.role)) {
    const url = req.nextUrl.clone();
    // admin ที่อยู่ในโหมดครูแล้วเปิดลิงก์ /admin ค้างไว้ → พาไปมุมครู ไม่ใช่หน้าแรกสาธารณะ
    url.pathname = session.realRole ? "/teacher" : "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*"],
};
