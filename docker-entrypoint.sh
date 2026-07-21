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

# ---- ตรวจ SchoolOS API key ----
# ต้องเช็คตรงนี้เพราะถ้า key ผิด อาการจะไปโผล่หน้า login ว่า "รหัสผู้ใช้ / รหัสผ่านไม่ถูกต้อง"
# (SchoolOS ตอบ 401 ทั้งกรณีรหัสผู้ใช้ผิดและ key ผิด) — ชี้ไปผิดทางจนหาสาเหตุไม่เจอ
# ยอมให้สตาร์ตไม่ขึ้นดีกว่าปล่อยขึ้นแล้วไม่มีใครล็อกอินได้โดยไม่รู้ว่าทำไม
echo "==> ตรวจ SchoolOS API key"
if [ -z "$SCHOOLOS_API_KEY" ]; then
  echo "    ❌ ไม่ได้ตั้ง SCHOOLOS_API_KEY ใน .env — ครูและนักเรียนจะล็อกอินไม่ได้"
  exit 1
fi
# ใช้ node ไม่ใช่ curl — image เป็น node:20-alpine ซึ่งไม่มี curl ติดมา
# (ถ้าใช้ curl จะกลายเป็นว่าคอนเทนเนอร์ไม่ยอมสตาร์ตทั้งที่ key ถูกต้อง)
node -e "
const base = (process.env.SCHOOLOS_API_BASE || 'http://192.168.200.56:3002').replace(/\/+\$/, '');
fetch(base + '/api/public/v1/teachers?pageSize=1', {
  headers: { 'X-API-Key': process.env.SCHOOLOS_API_KEY },
  signal: AbortSignal.timeout(10000),
})
  .then(async (res) => {
    if (res.ok) { console.log('    API key ใช้งานได้'); process.exit(0); }
    const code = await res.json().then((d) => d?.error?.code).catch(() => undefined);
    if (res.status === 401 || res.status === 403) {
      console.error('    ❌ SCHOOLOS_API_KEY ใช้ไม่ได้ (' + res.status + (code ? ' ' + code : '') + ') — key ผิด/หมดอายุ หรือขาด scope');
    } else {
      console.error('    ❌ ' + base + ' ตอบ HTTP ' + res.status);
    }
    process.exit(1);
  })
  .catch((e) => {
    console.error('    ❌ ต่อ ' + base + ' ไม่ได้ (' + (e.cause?.code || e.message) + ') — เช็ค network / SCHOOLOS_API_BASE');
    process.exit(1);
  });
" < /dev/null

echo "==> starting Next.js on :3017"
exec "$@"
