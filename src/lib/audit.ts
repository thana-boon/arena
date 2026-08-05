import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

/**
 * IP ของเครื่องที่สั่งงาน — อ่านจาก header ที่ reverse proxy ใส่มาให้
 *
 * ⚠ prod อยู่หลัง nginx เสมอ → socket ที่ Next เห็นคือ IP ของ proxy ไม่ใช่ของครู
 * ค่าที่ใช้ได้จริงจึงมาจาก header เท่านั้น และ nginx ต้องตั้ง proxy_set_header ไว้ด้วย:
 *     proxy_set_header X-Real-IP        $remote_addr;
 *     proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
 *
 * ⚠ ลำดับสำคัญ: เอา x-real-ip ก่อน x-forwarded-for — ไม่ใช่สลับกัน
 *   1) Next ใส่ x-forwarded-for ให้เองเสมอแม้ไม่มี proxy ถ้าเชื่อ header นั้นก่อน แล้ว nginx
 *      ตั้งแต่ X-Real-IP อย่างเดียว เราจะได้ IP ของ proxy มาทุกแถวโดยไม่รู้ตัว
 *   2) x-real-ip = $remote_addr ซึ่ง nginx เขียนทับเสมอ ปลอมจากฝั่งเบราว์เซอร์ไม่ได้
 *      ส่วน x-forwarded-for ตัวซ้ายสุดเป็นค่าที่ client ส่งมาเองได้ (ปลอมได้)
 * x-forwarded-for เป็นรายการต่อกัน "ต้นทาง, proxy1, proxy2" — ตัวซ้ายสุดคือเครื่องต้นทาง
 *
 * ไม่มีทั้งคู่ = ช่อง IP ว่าง (แสดงเป็น "—") ตั้งใจให้ว่างดีกว่าโชว์ IP ของ proxy
 * ซึ่งจะเหมือนกันหมดทุกแถวจนหลอกให้เข้าใจผิดว่าเป็นเครื่องเดียวกัน
 */
async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const raw = h.get("x-real-ip") ?? (fwd ? fwd.split(",")[0] : null);
    if (!raw) return "";
    // ::ffff:192.168.1.5 = IPv4 ที่ห่อในรูป IPv6 (เจอตอนต่อตรงไม่ผ่าน proxy) — ตัดหัวให้อ่านง่าย
    return raw.trim().replace(/^::ffff:/, "").slice(0, 64);
  } catch {
    // ถูกเรียกนอก request scope (เช่น สคริปต์ตอน deploy) — ไม่มี IP ให้บันทึก
    return "";
  }
}

/** บันทึก audit log — override admin, ประกาศผล, ลบ entry ฯลฯ */
export async function logAudit(
  who: string,
  action: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      who,
      action,
      detail: detail ? JSON.stringify(detail) : null,
      ip: await clientIp(),
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
