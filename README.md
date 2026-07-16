# Sukhon Arena — ระบบจัดการการแข่งขันทางวิชาการ

ระบบรับสมัคร บันทึกผล และประกาศผลการแข่งขันทางวิชาการ โรงเรียนสุคนธีรวิทย์
เป็น **standalone service** — production รันที่ `http://192.168.200.9/arena` (ดูข้อ 7)

Stack: **Next.js (App Router) + TypeScript · Drizzle ORM + PostgreSQL · JWT (httpOnly cookie) · PM2**
ดีไซน์ตาม `SKDW-CI.md`

---

## 1. ความต้องการระบบ

- Node.js ≥ 20 (ทดสอบบน 25)
- **PostgreSQL ≥ 13** — วิธีที่ง่ายที่สุดคือใช้ Docker (ดูข้อ 4)
- เข้าถึง Teacher API / Student API ที่ `192.168.200.9` ได้

> **prod (192.168.200.9) เป็น Windows Server 2012 R2 → ลงได้สูงสุดแค่ PostgreSQL 15**
> (PG 16 ขึ้นไปต้องใช้ Windows 10 / Server 2016 เป็นต้นไป)

## 2. ติดตั้ง

```bash
npm install
cp .env.example .env      # แล้วแก้ค่าให้ครบ (ดูข้อ 3)
```

## 3. ตั้งค่า `.env`

ค่าสำคัญ (API key อยู่ในไฟล์ `.env` — **ห้าม commit**):

| ตัวแปร | คำอธิบาย |
|---|---|
| `DATABASE_URL` | `postgres://arena:รหัส@localhost:5017/arena` (ค่า docker ในข้อ 4) |
| `JWT_SECRET` | สุ่มค่ายาว เช่น `openssl rand -hex 32` — **ห้ามใช้ค่าตัวอย่าง** |
| `TEACHER_API_KEY` | key ของ Teacher API (scope `auth:login`,`teachers:read`) |
| `STUDENT_API_KEY_VERIFY` | key scope `verify` |
| `STUDENT_API_KEY_READ` | key scope `read:basic` |
| `BASE_PATH` | subpath ที่เสิร์ฟ — เว้นว่างสำหรับ dev, prod ตั้ง `/arena` (ดูข้อ 7) |

## 4. สร้าง Database

**Docker (แนะนำสำหรับ dev)** — ได้ Postgres พร้อมใช้ที่ `localhost:5017` user/pass/db = `arena`
```bash
docker compose up -d db
```

**Postgres ที่ลงเอง** — ใช้สคริปต์สร้าง database + user
```bash
psql -U postgres -f scripts/setup-db.sql
```

> ค่า default: database `arena`, user `arena` / `arena_pass`
> ถ้าเปลี่ยนรหัส ให้แก้ `DATABASE_URL` ใน `.env` ให้ตรงกัน

## 5. สร้างตาราง + Seed

```bash
npm run db:push       # สร้าง/ปรับตารางให้ตรง schema.ts (วิธีหลักที่ใช้จริง)
npm run db:seed       # ปี 2569 (active), admin local, หมวดวิชา, รายการตัวอย่าง
# หรือรวบเป็นคำสั่งเดียว
npm run db:setup
```

> `db:push` เทียบ schema กับ DB แล้วปรับให้ตรงเลย ไม่ต้องมีไฟล์ migration — เหมาะกับโปรเจกต์นี้
> ส่วน `npm run db:migrate` (ใช้ไฟล์ใน `drizzle/`) มีไว้เผื่อ DB ใหม่เอี่ยมที่อยากได้ประวัติ migration

ข้อมูล seed:
- ปีการศึกษา **2569** (active) · เปิดรับสมัคร · จำกัด 2 รายการ/คน
- Admin local: **`admin` / `admin1234`** (ล็อกอินฝั่ง "ครู/ผู้ดูแล")
- หมวดวิชา 4 หมวด + รายการตัวอย่าง 1 เดี่ยว + 1 ทีม

## 6. รัน

```bash
# โหมดพัฒนา
npm run dev           # http://localhost:3017

# โหมด production
npm run build
npm start             # หรือใช้ PM2 (ข้อ 7)
```

## 7. Deploy ขึ้น prod (192.168.200.9)

prod อยู่ที่ `D:\API\arena` รันด้วย PM2 (`next start -p 5005`) แล้วมี **Apache (XAMPP :80) reverse proxy** ครอบอยู่ที่ `/arena` → `localhost:5005` เข้าใช้งานจริงที่ `http://192.168.200.9/arena`

```bash
# บนเครื่อง prod (cmd.exe) — ต้อง build บนเครื่องนั้น ห้าม build แล้วก็อบ .next ไป
cd /d D:\API\arena
npm install
npm run db:push       # เฉพาะตอน schema เปลี่ยน
npm run build
pm2 restart arena
```

**ข้อควรระวัง:**
- ก็อบไฟล์ไปให้ครบ ไม่ใช่แค่ `src/` — ต้องมี `package.json` / `package-lock.json` / `next.config.ts` / `drizzle.config.ts` ด้วย ไม่งั้น dependency ไม่ตรงแล้ว build พัง
- **อย่าทับ `.env` ของ prod** (คนละ key กับ dev) และ **อย่าใช้ `ecosystem.config.js`** — ไฟล์นั้นตั้ง port 3017 แต่ prod ใช้ 5005 ถ้าเผลอใช้ Apache จะ proxy ไม่เจอ
- prod ตั้ง `BASE_PATH=/arena` ไว้ใน `.env` — ค่านี้ถูก **bake ตอน build** ไม่ใช่ตอนรัน ถ้าหาย asset จะ 404 ทั้งหน้า เช็คหลัง build ด้วย
  `findstr /i basePath .next\required-server-files.json` → ต้องเห็น `"basePath":"/arena"`
- `next start` เสิร์ฟจาก `.next` ที่ build ไว้ ไม่เคยอ่าน `src/` ตอนรัน — ก็อบโค้ดแล้วไม่ build = ไม่มีอะไรเปลี่ยน
- ดู log: `pm2 flush arena` (ล้างของเก่าก่อน ไม่งั้นเจอ error เก่าหลอก) → เปิดหน้าเว็บให้พัง → `pm2 logs arena --lines 40 --nostream`
- PM2 บนเครื่องนั้น **ยังไม่ได้ตั้ง auto-start หลังรีบูต** — ถ้าเครื่องรีบูตต้อง `pm2 resurrect` เอง

---

## บทบาทผู้ใช้ (4 ระดับ)

| Role | เข้าสู่ระบบ | สิทธิ์ |
|---|---|---|
| **student** | รหัสนักเรียน + เลขบัตร 13 หลัก (Student API) | ลงทะเบียน/ถอนตัว/ดูรายการของตน |
| **teacher** | รหัสครู + รหัสผ่าน (Teacher API) | สร้าง/แก้รายการที่ตนสร้าง, เพิ่ม-ลดผู้เข้าแข่ง |
| **recorder** | ครูที่ admin ให้สิทธิ์ | เหมือน teacher + บันทึกคะแนน + ประกาศผล |
| **admin** | `admin`/`admin1234` หรือครูที่ให้สิทธิ์ | จัดการทุกอย่าง + override กติกา |

การมอบสิทธิ์ admin/recorder ทำที่ **Admin → สิทธิ์ครู** (เก็บใน `teacher_roles` โดย key = teacher_code)

## กติกาการลงทะเบียน (บังคับที่ server)

1. เปิดรับสมัคร + อยู่ในช่วงเวลา  2. ระดับชั้นตรงกับที่รายการรับ
3. ไม่เกินจำนวนรายการต่อคน  4. เวลาแข่งไม่ชนกัน
5. ที่นั่งไม่เต็ม (atomic counter กัน race)  6. ขนาดทีมถูกต้อง  7. ถอนตัวคืนที่นั่งใน transaction

> **admin เท่านั้น** ที่ override กติกา 1,3,4 ได้ (มี checkbox + บันทึก audit log)

## เกณฑ์เหรียญ

`ร้อยละ = คะแนนรวม / คะแนนเต็ม × 100` → ≥ gold% ทอง / ≥ silver% เงิน / ≥ bronze% ทองแดง / ต่ำกว่า = เข้าร่วม
(ปรับ % ได้ที่ Admin → ตั้งค่า) · คะแนนเท่ากัน = อันดับเดียวกัน (1,1,3)

## เอกสารพิมพ์ (3 แบบ)

ที่หน้ารายการ → ปุ่ม **🖨️ เอกสาร** → เลือกแท็บ แล้วกด Ctrl+P (print-friendly A4):
1. ใบรายชื่อผู้เข้าแข่งขัน  2. ใบกรอกคะแนน (ช่องว่าง + ลายมือชื่อ)  3. ใบประกาศผล (คะแนน+อันดับ+เหรียญ)

---

## โครงสร้างโค้ด

```
src/
  app/
    (public)/        หน้า public: / , /results
    login/           หน้าเข้าสู่ระบบ 2 โหมด
    student/         พื้นที่นักเรียน
    teacher/         พื้นที่ครู/recorder (competitions, scoring, reports)
    admin/           พื้นที่ผู้ดูแล
    api/             route handlers (auth, competitions, registrations, scores, admin)
  components/        UI ที่ใช้ร่วม (AppShell, CompetitionForm, StudentPicker, ...)
  db/                schema.ts, migrate.ts, seed.ts
  lib/               auth, external API clients, registration engine, results, ...
```

หมายเหตุ: คอลัมน์ที่เก็บ json array (`allowed_class_levels`, `audit_log.detail`) เก็บเป็น `text`
แล้ว parse/validate ที่ app layer — เป็นมรดกจากตอนใช้ MariaDB ที่ไม่มี native json คงไว้เพื่อไม่ต้องแก้ layer อื่น
