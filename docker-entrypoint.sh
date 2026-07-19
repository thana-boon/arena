#!/bin/sh
set -e

# ทุกคำสั่งในไฟล์นี้ปิด stdin (< /dev/null) — บน docker server ไม่มี TTY
# ถ้ามี prompt โผล่มาต้อง "พังทันที" ไม่ใช่ค้างรอ input เงียบ ๆ จนกว่าจะมีคนไปดู

# ---- รอ postgres พร้อมก่อน ----
# กันกรณีสตาร์ตพร้อม postgres-core แล้วต่อไม่ทัน (จะได้ไม่ crash loop ให้ตกใจเล่น)
echo "==> รอ postgres พร้อมใช้งาน"
node -e "
const { Client } = require('pg');
(async () => {
  for (let i = 1; i <= 60; i++) {
    try {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect(); await c.end();
      console.log('    postgres พร้อมแล้ว');
      process.exit(0);
    } catch (e) {
      if (i === 1 || i % 5 === 0) console.log('    ยังต่อไม่ได้ (' + (e.code || e.message) + ') ลองใหม่ ' + i + '/60');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('    ❌ ต่อ postgres ไม่ได้ภายใน 2 นาที — เช็ค DATABASE_URL / network school-net');
  process.exit(1);
})();
" < /dev/null

# ---- schema ----
# push --force = ไม่ถามยืนยันและยอมรับ statement ที่ทำข้อมูลหายเอง
# ถ้า schema เปลี่ยนแบบกำกวม (drizzle เดาไม่ออกว่า rename หรือคอลัมน์ใหม่) มันจะอยากถาม
# → stdin ปิดอยู่ คำสั่งจะ error ออกมาเลย ดู log แล้วแก้ก่อน deploy รอบหน้า
echo "==> drizzle-kit push --force"
npm run db:push < /dev/null

# ---- ข้อมูลตั้งต้น ----
# idempotent เต็มรูปแบบ: มี admin/ปีการศึกษาอยู่แล้ว = ข้ามทั้งหมด ไม่แตะของเดิม
# ไม่มี demo data (อยากได้ข้อมูลตัวอย่างตอน dev ให้รัน `npm run db:seed` เองบน host)
if [ "$SKIP_BOOTSTRAP" = "1" ]; then
  echo "==> ข้าม auto-bootstrap (SKIP_BOOTSTRAP=1)"
else
  echo "==> auto-bootstrap"
  npm run db:bootstrap < /dev/null
fi

echo "==> starting Next.js on :3017"
exec "$@"
