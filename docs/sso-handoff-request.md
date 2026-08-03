# คำขอเพิ่ม endpoint "handoff" ที่ฝั่ง SchoolOS Users

**จาก:** ทีม arena (Sukhon Arena :3017) · **ถึง:** ทีม SchoolOS Users (:3002)
**สถานะ (2 ส.ค. 2569):** ✅ Users ทำ endpoint ให้แล้ว · ✅ arena ต่อเสร็จแล้ว
— เหลือรอเปิด scope/audience ให้ API key และ deploy ขึ้นเครื่องโรงเรียน (ดู "ภาคผนวก" ท้ายไฟล์)

---

## 1. สรุปปัญหาใน 5 บรรทัด

contract SSO ชุดปัจจุบันแชร์ session ได้ **เฉพาะภายในเบราว์เซอร์** เท่านั้น
`GET /api/auth/session` ต้องยิงจาก client เพราะคุกกี้อยู่ที่ origin ของ Users

แต่ arena เป็น Next.js App Router ที่บังคับสิทธิ์ใน **middleware + server component**
ซึ่งอ่านคุกกี้ของ Users ไม่ได้ → arena จำเป็นต้องมี session cookie ของตัวเอง (JWT `arena_session`)

**ช่องว่างคือ:** ไม่มีวิธีให้ *เซิร์ฟเวอร์* ของ arena พิสูจน์ได้ว่า "คนที่กำลังยิงมาคือผู้ใช้ที่ Users บอกว่าล็อกอินอยู่จริง"

---

## 2. ทำไมของที่มีอยู่แล้วใช้แทนไม่ได้

| ของที่มี | ทำไมไม่พอ |
|---|---|
| `GET /api/auth/session` | ผลอยู่ที่เบราว์เซอร์ ถ้าเบราว์เซอร์ POST มาบอก arena ว่า `{code:"T00116"}` เซิร์ฟเวอร์ arena **ตรวจไม่ได้ว่าจริงไหม** → ใครก็ตามที่รู้รหัสครู (ซึ่งพิมพ์อยู่บนเอกสารทั่วโรงเรียน) `curl` ครั้งเดียวได้สิทธิ์ admin เท่ากับถอดรหัสผ่านทิ้ง |
| คุกกี้ `sso_session` | httpOnly + คนละ origin → JS อ่านไม่ได้ เซิร์ฟเวอร์ arena ก็ forward ต่อไม่ได้ |
| คุกกี้ `schoolos_session_exp` | คนละ origin อ่านไม่ได้ และมีแค่เวลาหมดอายุ ไม่ใช่หลักฐานตัวตน |
| `POST /api/public/v1/auth/verify` (arena มี API key อยู่แล้ว) | ต้องใช้รหัสผ่าน = ผู้ใช้ต้องล็อกอินซ้ำ ซึ่งคือสิ่งที่เราพยายามเลี่ยง |
| verify JWT เอง | ห้ามตาม contract และ Users จงใจไม่แจก `JWT_SECRET` (ถูกต้องแล้ว) |

เราจึงขอ **ของชิ้นเดียว** ที่ปิดช่องนี้ได้: one-time authorization code

---

## 3. สเปกที่ขอ — one-time code (2 endpoint)

แนวคิด: ให้เบราว์เซอร์ที่ *ถือคุกกี้จริง* ขอ "โค้ดใช้ครั้งเดียว อายุสั้น" มาส่งต่อให้เซิร์ฟเวอร์ arena
แล้ว **เซิร์ฟเวอร์** arena เอาโค้ดนั้นไปแลกตัวตนด้วย `X-API-Key` ที่มีอยู่แล้ว
โค้ดจึงออกได้เฉพาะจาก session จริง และแลกได้เฉพาะผู้ที่ถือ secret ของ arena

### 3.1 `GET /api/auth/handoff` — เบราว์เซอร์เรียก (cookie-based)

```
GET http://<users>/api/auth/handoff?audience=arena
Origin: http://localhost:3017        ← ต้องอยู่ใน SSO_ALLOWED_ORIGINS (มีอยู่แล้ว)
credentials: include                  ← arena ใส่ให้แน่นอน
```

**200 (ล็อกอินอยู่)**
```json
{ "valid": true, "code": "hc_<base64url 32 bytes>", "expiresIn": 60 }
```

**200 (ยังไม่ล็อกอิน)** — ขอให้ตอบ 200 เหมือน `/api/auth/session` เพื่อความสม่ำเสมอ
```json
{ "valid": false, "code": null }
```

คุณสมบัติของโค้ดที่ขอ:

| ข้อ | ค่าที่ขอ | เหตุผล |
|---|---|---|
| ความสุ่ม | CSPRNG ≥ 32 bytes | เดาไม่ได้ |
| อายุ | **≤ 60 วินาที** | หลุด log/history แล้วก็หมดอายุก่อนใช้ |
| ใช้ได้ | **ครั้งเดียว** (atomic consume) | redeem ซ้ำต้องล้มเหลว |
| ผูกกับ | `session id` + `audience` | โค้ดของ arena เอาไปใช้ที่บริการอื่นไม่ได้ |
| ยกเลิกเมื่อ | logout / session หมดอายุ | โค้ดค้างต้องตายตาม |
| rate limit | ต่อ session (เช่น 10 ครั้ง/นาที) ก็พอ | กันยิงรัว |

> ⚠ **ไม่ต่ออายุ session** — endpoint นี้เป็นแค่การอ่านตัวตน ขอให้ทำงานเหมือน
> `GET /api/auth/session` คือไม่ขยับ idle window (arena จะเรียก `POST /api/auth/refresh` แยกเองตามปกติ)

### 3.2 `POST /api/public/v1/auth/handoff/redeem` — เซิร์ฟเวอร์ arena เรียก (API-key)

```
POST http://<users>/api/public/v1/auth/handoff/redeem
X-API-Key: sk_live_...                ← key เดิมของ arena ขอเพิ่ม scope เช่น auth:handoff
Content-Type: application/json

{ "code": "hc_..." }
```

**200**
```json
{
  "valid": true,
  "user": { "sub": "T00116", "role": "teacher", "code": "T00116", "name": "..." },
  "expiresAt": 1785678052000,
  "absoluteEndsAt": 1785700000000
}
```

ขอให้ `user` เป็น **โครงเดียวกับ `GET /api/auth/session`** เป๊ะ (arena จะได้ใช้ mapper ตัวเดียวกัน)
`permissions` ใส่มาหรือไม่ใส่ก็ได้ — arena ไม่ใช้ (สิทธิ์ในระบบ arena map จาก `sub`/`code` เข้าตารางของเราเอง)

**400 / 401**
```json
{ "error": { "code": "invalid_code" | "expired_code" | "used_code" | "audience_mismatch" } }
```

ขอให้แยก `error.code` ออกจาก error ของ API key (`invalid_key` / `missing_scope` ฯลฯ) แบบเดียวกับที่
`/auth/verify` แยก `invalid_credentials` ออกมาให้แล้ว — ตอนนี้ arena พึ่งพฤติกรรมนั้นอยู่จริง
(ถ้าแยกไม่ได้ ปัญหา config ฝั่ง arena จะไปโผล่หน้าจอผู้ใช้ว่า "ล็อกอินไม่สำเร็จ" ซึ่งไล่หาสาเหตุแทบไม่ได้)

---

## 4. flow ที่ arena จะทำ

```
เบราว์เซอร์ (ผู้ใช้เปิดหน้า arena/login)     arena server            Users
    │
    ├─ GET /api/auth/session ────────────────────────────────────────▶  valid:true
    │                                                              ◀────
    ├─ GET /api/auth/handoff?audience=arena ─────────────────────────▶  code (60s, 1 ครั้ง)
    │                                                              ◀────
    ├─ POST /api/auth/sso {code} ──────────▶
    │                                       ├─ POST /redeem + X-API-Key ─▶
    │                                       ◀──────────── user ที่เชื่อถือได้ ─┤
    │                                       ├─ map role: teacher-admin / teacher_roles
    │                                       ├─ ออก JWT arena_session (httpOnly)
    │                                  ◀────┤
    └─ เข้าหน้า /teacher หรือ /admin ได้เลย ไม่ต้องกรอกรหัสผ่าน
```

จุดสำคัญ: `code` ที่วิ่งผ่านเบราว์เซอร์ **ปลอมไม่ได้** (ต้องมีคุกกี้จริงถึงจะขอได้)
และ **ใช้ต่อไม่ได้** (หมดอายุ 60 วิ + ใช้ครั้งเดียว + ต้องมี API key ถึงจะแลกเป็นตัวตนได้)

---

## 5. ทางเลือกอื่นที่เราพิจารณาแล้วและ**ไม่**แนะนำ

- **`/auth/introspect` รับ session token** — เบราว์เซอร์อ่าน `sso_session` ไม่ได้ (httpOnly ซึ่งถูกแล้ว)
  จะใช้ทางนี้ต้องเปิดให้ JS อ่าน token ได้ = แย่กว่าเดิมมาก **ตัดทิ้ง**
- **redirect handshake แบบ OAuth (`/authorize?redirect_uri=`)** — ปลอดภัยเท่ากัน แต่ต้องสร้างของใหม่เยอะกว่า
  ถ้าฝั่ง Users อยากเดินทางนี้เพื่อรองรับบริการอื่นในระยะยาว arena ก็ปรับตามได้ **บอกมาได้เลย**
- **ให้ arena เชื่อผล probe จาก client ตรงๆ** — ช่องโหว่ตามข้อ 2 **ตัดทิ้ง**

---

## 6. เรื่องอื่นที่ arena จะทำเองอยู่แล้ว (ไม่ต้องแก้อะไรฝั่ง Users)

- helper กลางตัวเดียว `src/lib/sso.ts` คุม probe / login / refresh / logout ทั้งหมด
- `credentials:'include'` ทุก endpoint · แคช probe ถึง `expiresAt` · in-flight dedupe · ล้างแคชตอน login/logout/refresh
- ต่ออายุด้วย `POST /api/auth/refresh` เมื่อมี activity จริง + เลยครึ่งทางไป `expiresAt` (แก้กับดัก 3.6) พร้อมเตือนก่อนหมด 2 นาที
- logout เรียก `GET /api/auth/logout?next=` ของ Users ด้วยเสมอ (ออกทั้งแพลตฟอร์ม)
- ปรับเพดาน absolute ของ arena จาก 12 ชม. → **8 ชม.** ให้ตรงกับ Users
- ไม่ใช้ `permissions` (`users:read`/`users:write`) ตัดสินสิทธิ์ใดๆ ในระบบ arena

## 7. สิ่งที่ต้องขอเพิ่มเติมนอกเหนือจาก endpoint

1. **scope ใหม่บน API key ของ arena** — เช่น `auth:handoff` (key เดิม `sk_live_wvmY...`)
2. **origin ของ arena บน prod ใน `SSO_ALLOWED_ORIGINS`** — origin ที่ต้องเพิ่มคือ

   ```
   https://schoolos.sukhon.ac.th
   ```

   (ยืนยันแล้วว่ายังไม่มี: `GET /users/api/auth/handoff?audience=arena` พร้อม header
   `Origin: https://schoolos.sukhon.ac.th` ตอบ `403 forbidden_origin`)
   ส่วน dev `http://localhost:3017` มีอยู่แล้วบน instance เทสและทดสอบผ่านเรียบร้อย
3. ~~ถ้าวันหนึ่งย้าย arena ไปคนละโดเมนจริง คุกกี้ต้องเป็น `SameSite=None; Secure`~~
   **ตกไปแล้ว** — prod เสิร์ฟทั้งสองบริการใต้โดเมนเดียวกันคือ
   `https://schoolos.sukhon.ac.th/arena` และ `https://schoolos.sukhon.ac.th/users`
   ซึ่งเป็น **same-origin** เต็มรูปแบบ `SameSite=Lax` ใช้ได้ตามปกติ ไม่ต้องแก้อะไรฝั่งคุกกี้

---

# ภาคผนวก — สิ่งที่ arena ทำจริง (2 ส.ค. 2569)

## ก. 4 จุดที่ Users ทำต่างจากที่ขอ และ arena จัดการยังไง

| # | สิ่งที่ต่าง | arena จัดการ |
|---|---|---|
| 1 | ผูกโค้ดด้วย `sub + login_at + audience` ไม่ใช่ session id (JWT ไม่มี jti) | ไม่กระทบ — arena ไม่ได้เก็บ id อ้างอิงกลับอยู่แล้ว ใช้ `absoluteEndsAt` ที่ redeem คืนมาเป็นตัวกำหนดเพดาน session ของเราแทน (`createSession(payload, { absoluteEndsAt })` → `abs = min(8 ชม.ของเรา, ของ Users)`) |
| 2 | โค้ดที่ออกไปแล้วยังแลกได้อีก ≤60 วิ หลังผู้ใช้กด logout (ไม่มี blocklist) | ทำตามที่แนะนำ: `SessionTimeout` probe `/api/auth/session` แบบ **ข้ามแคช** ทุกครั้งที่ผู้ใช้กลับมาที่แท็บ (`visibilitychange`) และตอนเปิดหน้า — เจอ `valid:false` เมื่อไหร่ล้าง `arena_session` ทิ้งทันทีแล้วส่งไป `/login?reason=sso` |
| 3 | `role` ใน payload มีแค่ `teacher \| student` (ไม่มี `teacher-admin`) | **ไม่ใช้ `permissions`** ตัดสินสิทธิ์เด็ดขาด (ผิดข้อกำหนดของ arena — `users:write` เป็นสิทธิ์ของโมดูล Users ไม่ใช่ของระบบแข่งขัน) เลือกทางที่สอง: อ่าน role จริงจาก `GET /api/public/v1/teachers` ด้วย scope `teachers:read` ที่มีอยู่แล้ว ซึ่งเป็นเส้นทางเดียวกับที่ login ด้วยรหัสผ่านใช้อยู่เดิม → สองทางให้สิทธิ์ตรงกันเสมอ (โค้ด map อยู่ที่ `src/lib/auth/mapUser.ts` ที่เดียว) |
| 4 | `audience` ผูกกับตัว API key จริง (ต้องตั้งให้ก่อน ไม่งั้น `key_audience_unset`) | รับทราบ — arena ส่ง `?audience=arena` เสมอ และแยก error กลุ่ม config (`key_audience_unset` / `audience_mismatch` / `missing_scope` / `invalid_key`) ออกจากกลุ่มที่ผู้ใช้แก้เองได้ (`invalid_code` / `expired_code` / `used_code`) — กลุ่มแรกขึ้น log พร้อมบอกวิธีแก้ + ตอบผู้ใช้ 503, กลุ่มหลังตอบ 401 ให้ไปกรอกรหัสผ่านแทน |

> เรื่อง `SameSite=None; Secure` (ข้อ 7.3 เดิม) — เห็นด้วยว่าเป็นอีกงานแยก ตัดออกจากขอบเขตนี้แล้ว

## ข. ผลทดสอบที่ทำได้แล้ว (2 ส.ค. 2569)

| ทดสอบ | ผล |
|---|---|
| `GET /api/auth/handoff?audience=arena` ไม่มีคุกกี้ (localhost:3002) | ✅ `200 {"valid":false,"code":null}` ตรงสเปก |
| CORS ของ handoff + refresh + session จาก origin `http://localhost:3017` | ✅ `access-control-allow-origin` + `allow-credentials: true` ครบทั้งสาม |
| `POST /auth/handoff/redeem` โค้ดมั่ว → arena แปลง error | ✅ ได้ `error.code` เป็น JSON, arena ตอบ 503 + log บอกวิธีแก้ |
| หน้า `/login` ตอน handoff ใช้ไม่ได้ | ✅ ตกกลับไปฟอร์มรหัสผ่านเสมอ ไม่ค้างหน้าขาว |
| `npx tsc --noEmit` + `npm run build` | ✅ ผ่านทั้งคู่ |

## ค. ที่ยังทดสอบไม่ได้ (รอฝั่ง Users)

1. **API key ของ arena ยังใช้กับ localhost:3002 ไม่ได้** — ตอบ `invalid_key`
   (`GET /api/public/v1/me` บนเครื่องโรงเรียนเห็น scope แค่
   `students:read, teachers:read, auth:students, auth:teachers, students:photo, teachers:photo`
   → ยังไม่มี `auth:handoff` และยังไม่มีฟิลด์ `handoffAudience`)
2. **เครื่องโรงเรียน `192.168.200.56:3002` ยังไม่มี endpoint handoff** — ตอบ 404 (มีแต่บน localhost:3002)
3. จึงยังไม่ได้ทดสอบ flow เต็ม: ล็อกอินที่บริการอื่น → เปิด arena → เข้าได้เลยไม่ต้องกรอกรหัส

## ง. checklist ตอน Users deploy เสร็จ

- [ ] `GET /api/public/v1/me` ด้วย key ของ arena ต้องเห็น `auth:handoff` ใน scopes และ `handoffAudience: "arena"`
- [ ] เพิ่ม origin ของ arena บน prod เข้า `SSO_ALLOWED_ORIGINS` (arena จะแจ้ง origin ที่แน่นอนให้)
- [ ] ฝั่ง arena: ตั้ง `NEXT_PUBLIC_SSO_BASE_URL` แล้ว **build ใหม่** (เป็นค่า build-time เหมือน `BASE_PATH`)
- [ ] ทดสอบ: ล็อกอินบริการอื่น → เปิด arena → เข้าได้เลย · กด "ออกจากระบบ" ที่ arena → บริการอื่นหลุดด้วย
- [ ] ทดสอบเครื่องใช้ร่วม: logout จากบริการอื่น → กลับมาแท็บ arena → ต้องถูกเตะออกภายในไม่กี่วินาที
