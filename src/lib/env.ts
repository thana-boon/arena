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

  // ===== SSO กับ SchoolOS Users =====
  // ⚠ ทั้งกลุ่มนี้เป็น env ของ "runtime" ไม่ใช่ NEXT_PUBLIC_* ที่ถูก bake ตอน build โดยเจตนา
  // เบราว์เซอร์อ่านค่าผ่าน GET /api/auth/sso/config เอา — ย้ายโดเมน/ปิด SSO จึงแก้ .env แล้ว
  // restart ได้เลย ไม่ต้อง rebuild image (BASE_PATH เป็นตัวเดียวที่ยัง bake อยู่)

  /**
   * ที่อยู่ Users "ในสายตาเบราว์เซอร์" เช่น https://schoolos.sukhon.ac.th/users
   * ไม่ตั้ง (ค่าว่าง) = ปิด SSO ทั้งระบบ ล็อกอินด้วยรหัสผ่านยังทำงานครบเหมือนเดิม
   * ⚠ ห้ามใส่พอร์ตหลังบ้าน (:3002) — เครื่องผู้ใช้ส่วนใหญ่เข้าไม่ถึงพอร์ตภายใน
   */
  SSO_USERS_BASE: (process.env.SSO_USERS_BASE ?? "").replace(/\/+$/, ""),

  /** ชื่อระบบปลายทางที่ผูกไว้กับ API key ฝั่ง Users — ต้องตรงกับ handoffAudience ของ key เป๊ะ */
  SSO_AUDIENCE: process.env.SSO_AUDIENCE || "arena",

  /** หน้าแรกของ SchoolOS — ที่ที่ผู้ใช้ถูกส่งไปเมื่อ session จบ (path ล้วนได้ เพราะ same-origin) */
  SSO_PORTAL_URL: process.env.SSO_PORTAL_URL || "/",

  /**
   * ที่อยู่ Users "ในสายตา server ของเรา" — ใช้ตอนแลกโค้ด handoff ด้วย X-API-Key เท่านั้น
   *
   * ต้องเป็น Users อินสแตนซ์เดียวกับที่เบราว์เซอร์ขอโค้ดมา ไม่งั้นโค้ดที่ออกจากเครื่องหนึ่ง
   * เอาไปแลกอีกเครื่องไม่ได้ (invalid_code) · ปกติเท่ากับ SCHOOLOS_API_BASE
   * แยกไว้เผื่อตอน dev ที่รัน Users บนเครื่องตัวเองแต่ยังดึงข้อมูลครู/นักเรียนจากเซิร์ฟเวอร์โรงเรียน
   */
  SSO_API_BASE: (process.env.SSO_API_BASE || process.env.SCHOOLOS_API_BASE || "http://192.168.200.56:3002").replace(/\/+$/, ""),
};

/** SSO เปิดใช้งานอยู่ไหม — ตัดสินจากค่าเดียว: ตั้ง SSO_USERS_BASE แล้วหรือยัง */
export const SSO_ENABLED = env.SSO_USERS_BASE.length > 0;
