#!/bin/sh
set -e

# ทุกคำสั่งในไฟล์นี้ปิด stdin (< /dev/null) — บน docker server ไม่มี TTY
# ถ้ามี prompt โผล่มาต้อง "พังทันที" ไม่ใช่ค้างรอ input เงียบ ๆ จนกว่าจะมีคนไปดู

# ---- ค่าที่ใช้จริงรอบนี้ ----
# พิมพ์ตั้งแต่บรรทัดแรกเสมอ: เวลา prod พังหลัง deploy คำถามแรกคือ "BASE_PATH ติดไปหรือเปล่า"
# และ "ยิง SchoolOS ไปที่ไหน" — ถ้าไม่มีบรรทัดนี้ต้องไปไล่เดาจาก compose ทีละชั้น
# ⚠ BASE_PATH ว่าง = Next คิดว่าอยู่ที่ root แล้ว asset กลายเป็น /_next/... → 404 ทั้งเว็บ
#   (compose ใช้ ${BASE_PATH-/arena} ซึ่ง fallback เฉพาะตอน "ไม่มีตัวแปร" — มีตัวแปรแต่ค่าว่างจะได้ค่าว่างจริง)
echo "==> arena เริ่มทำงาน"
echo "    BASE_PATH        = '${BASE_PATH}'"
if [ -z "$BASE_PATH" ]; then
  echo "        ⚠ BASE_PATH ว่าง = เสิร์ฟที่ root — ถ้า prod อยู่หลัง nginx ที่ /arena จะได้ 404 ทั้งเว็บ"
fi
echo "    SCHOOLOS_API_BASE= ${SCHOOLOS_API_BASE:-<default 192.168.200.56:3002>}"
echo "    SSO_USERS_BASE   = ${SSO_USERS_BASE:-<ว่าง = ปิด SSO>}"
echo "    SESSION          = idle ${SESSION_IDLE_MINUTES:-15} นาที / เพดาน ${SESSION_ABSOLUTE_MINUTES:-480} นาที"

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

# ---- ตรวจ SchoolOS API key + scope ของ SSO ----
# ต้องเช็คตรงนี้เพราะถ้า key ผิด อาการจะไปโผล่หน้า login ว่า "รหัสผู้ใช้ / รหัสผ่านไม่ถูกต้อง"
# (SchoolOS ตอบ 401 ทั้งกรณีรหัสผู้ใช้ผิดและ key ผิด) — ชี้ไปผิดทางจนหาสาเหตุไม่เจอ
#
# ⚠ "เตือน" อย่างเดียว ห้าม exit 1 เด็ดขาด
# เคยตั้งเป็นตายทันทีแล้วเจอของจริง: SchoolOS ล่มชั่วคราว/เน็ตสะดุดตอนคอนเทนเนอร์สตาร์ต
# → arena restart วนไม่จบ = ระบบตายตามทั้งที่หน้าดูผลสาธารณะและ admin local ยังทำงานได้สบาย
# ปัญหา key เป็นเรื่องที่ "อ่านจาก log แล้วแก้" ไม่ใช่เรื่องที่ต้องปิดทั้งระบบเพื่อบังคับให้แก้
echo "==> ตรวจ SchoolOS API key"
if [ -z "$SCHOOLOS_API_KEY" ]; then
  echo "    ⚠ ไม่ได้ตั้ง SCHOOLOS_API_KEY — ครูและนักเรียนจะล็อกอินไม่ได้ (admin local ยังเข้าได้)"
fi
# ใช้ node ไม่ใช่ curl — image เป็น node:20-alpine ซึ่งไม่มี curl ติดมา
# `|| true` กัน set -e ฆ่าสคริปต์ ถ้าวันหนึ่งมีใครใส่ process.exit(1) กลับเข้าไป
node -e "
const base = (process.env.SCHOOLOS_API_BASE || 'http://192.168.200.56:3002').replace(/\/+\$/, '');
const ssoBase = (process.env.SSO_API_BASE || base).replace(/\/+\$/, '');
const key = process.env.SCHOOLOS_API_KEY || '';
const audience = process.env.SSO_AUDIENCE || 'arena';
const ssoOn = !!(process.env.SSO_USERS_BASE || '').trim();
const h = { 'X-API-Key': key };

(async () => {
  if (!key) return;
  try {
    const res = await fetch(base + '/api/public/v1/teachers?pageSize=1', { headers: h, signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      console.log('    API key ใช้งานได้');
    } else {
      const code = await res.json().then((d) => d?.error?.code).catch(() => undefined);
      if (res.status === 401 || res.status === 403) {
        console.warn('    ⚠ SCHOOLOS_API_KEY ใช้ไม่ได้ (' + res.status + (code ? ' ' + code : '') + ') — key ผิด/หมดอายุ หรือขาด scope');
      } else {
        console.warn('    ⚠ ' + base + ' ตอบ HTTP ' + res.status);
      }
    }
  } catch (e) {
    console.warn('    ⚠ ต่อ ' + base + ' ไม่ได้ (' + (e.cause?.code || e.message) + ') — เช็ค network / SCHOOLOS_API_BASE');
  }

  // ---- SSO: scope auth:handoff + audience ต้องตั้งครบ ไม่งั้นแลกโค้ดไม่ได้เลย ----
  // มี scope แต่ไม่ตั้ง audience ก็ใช้ไม่ได้ (key_audience_unset) — ต้องเห็นทั้งสองอย่าง
  if (!ssoOn || !key) {
    if (!ssoOn) console.log('    SSO: ปิดอยู่ (ไม่ได้ตั้ง SSO_USERS_BASE)');
    return;
  }
  try {
    const res = await fetch(ssoBase + '/api/public/v1/me', { headers: h, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn('    ⚠ SSO: ถาม /me ไม่ได้ (HTTP ' + res.status + ') — ยังไม่ยืนยันว่า scope/audience ครบ');
      return;
    }
    const me = await res.json();
    const scopes = me?.scopes || me?.key?.scopes || [];
    const aud = me?.handoffAudience ?? me?.key?.handoffAudience ?? null;
    const hasScope = Array.isArray(scopes) && scopes.includes('auth:handoff');
    if (!hasScope) console.warn('    ⚠ SSO: API key ยังไม่มี scope auth:handoff — silent SSO จะไม่ทำงาน (ล็อกอินด้วยรหัสผ่านยังปกติ)');
    if (aud !== audience) console.warn('    ⚠ SSO: handoffAudience = ' + JSON.stringify(aud) + ' แต่ SSO_AUDIENCE = ' + JSON.stringify(audience) + ' — ต้องตรงกันเป๊ะ');
    if (hasScope && aud === audience) console.log('    SSO: พร้อมใช้งาน (auth:handoff + audience=' + audience + ')');
  } catch (e) {
    console.warn('    ⚠ SSO: ต่อ ' + ssoBase + ' ไม่ได้ (' + (e.cause?.code || e.message) + ')');
  }
})();
" < /dev/null || true

echo "==> starting Next.js on :3017"
exec "$@"
