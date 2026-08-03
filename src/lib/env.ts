import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: req("DATABASE_URL"),
  JWT_SECRET: req("JWT_SECRET"),
  // SchoolOS Public API (host ใหม่) — key เดียวหลาย scope (ดู API-KEYS.md)
  SCHOOLOS_API_BASE: (process.env.SCHOOLOS_API_BASE ?? "http://192.168.200.56:3002").replace(/\/+$/, ""),
  SCHOOLOS_API_KEY: process.env.SCHOOLOS_API_KEY ?? "",
  /**
   * base URL ของ Users ที่ "server ของเรา" เรียกถึงตอนแลกโค้ด handoff
   *
   * ต้องชี้ Users "อินสแตนซ์เดียวกัน" กับ NEXT_PUBLIC_SSO_BASE_URL ที่เบราว์เซอร์ใช้ขอโค้ด
   * ไม่งั้นโค้ดที่ออกจากเครื่องหนึ่งจะเอาไปแลกอีกเครื่องไม่ได้ (invalid_code)
   * ปกติเท่ากับ SCHOOLOS_API_BASE — แยกไว้เผื่อตอน dev ที่ Users รันบนเครื่องตัวเอง
   * แต่ข้อมูลครู/นักเรียนยังดึงจากเซิร์ฟเวอร์โรงเรียน
   */
  SSO_API_BASE: (process.env.SSO_API_BASE || process.env.SCHOOLOS_API_BASE || "http://192.168.200.56:3002").replace(/\/+$/, ""),
};
