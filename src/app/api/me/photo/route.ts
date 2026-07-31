import { getSession } from "@/lib/auth/session";
import { sosPhoto } from "@/lib/external/schoolos";

// รูปโปรไฟล์ของ "ผู้ใช้ที่ล็อกอินอยู่" เท่านั้น — path รูปมาจาก session ไม่ได้รับจาก query
// (endpoint รูปของ SchoolOS ต้องแนบ X-API-Key ซึ่งห้ามหลุดไปเบราว์เซอร์ จึงต้อง proxy ที่นี่)
export async function GET() {
  const session = await getSession();
  if (!session?.photo) return new Response(null, { status: 404 });

  try {
    const res = await sosPhoto(session.photo);
    if (!res.ok || !res.body) return new Response(null, { status: 404 });
    return new Response(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/webp",
        // ส่วนตัวของผู้ใช้คนนี้ — ห้าม proxy กลางแคชร่วม
        "cache-control": "private, max-age=300, must-revalidate",
      },
    });
  } catch {
    // SchoolOS ช้า/ล่ม — ให้ avatar ตกไปใช้ตัวอักษรย่อแทน ไม่ต้องพังทั้งหน้า
    return new Response(null, { status: 404 });
  }
}
