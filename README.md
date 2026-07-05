# SKDW Arena — ระบบจัดการการแข่งขันทางวิชาการ

ระบบรับสมัคร บันทึกผล และประกาศผลการแข่งขันทางวิชาการ โรงเรียนสุขนธีรวิทย์
เป็น **standalone service** รันที่ `http://192.168.200.9:5005`

Stack: **Next.js (App Router) + TypeScript · Drizzle ORM + MySQL/MariaDB (XAMPP) · JWT (httpOnly cookie) · PM2**
ดีไซน์ตาม `SKDW-CI.md`

---

## 1. ความต้องการระบบ

- Node.js ≥ 20 (ทดสอบบน 25)
- XAMPP (MariaDB/MySQL) รันอยู่ที่ `localhost:3306`
- เข้าถึง Teacher API / Student API ที่ `192.168.200.9` ได้

## 2. ติดตั้ง

```bash
npm install
cp .env.example .env      # แล้วแก้ค่าให้ครบ (ดูข้อ 3)
```

## 3. ตั้งค่า `.env`

ค่าสำคัญ (API key อยู่ในไฟล์ `.env` — **ห้าม commit**):

| ตัวแปร | คำอธิบาย |
|---|---|
| `DATABASE_URL` | `mysql://compete_user:รหัส@localhost:3306/compete` |
| `JWT_SECRET` | สุ่มค่ายาว เช่น `openssl rand -hex 32` |
| `TEACHER_API_KEY` | key ของ Teacher API (scope `auth:login`,`teachers:read`) |
| `STUDENT_API_KEY_VERIFY` | key scope `verify` |
| `STUDENT_API_KEY_READ` | key scope `read:basic` |

## 4. สร้าง Database + User

ผ่าน **CLI** (แนะนำ):
```bash
# ใช้ mysql ของ XAMPP (Windows path)
/c/xampp/mysql/bin/mysql -u root -p < scripts/setup-db.sql
```
หรือเปิด **phpMyAdmin** → แท็บ SQL → วางเนื้อหาไฟล์ `scripts/setup-db.sql` → Go

> ค่า default: database `compete` (utf8mb4_unicode_ci), user `compete_user` / `compete_pass`
> ถ้าเปลี่ยนรหัส ให้แก้ `DATABASE_URL` ใน `.env` ให้ตรงกัน

## 5. Migrate + Seed

```bash
npm run db:migrate    # สร้างตารางทั้งหมด (InnoDB, รองรับ transaction)
npm run db:seed       # ปี 2569 (active), admin local, หมวดวิชา, รายการตัวอย่าง
# หรือรวบเป็นคำสั่งเดียว
npm run db:setup
```

ข้อมูล seed:
- ปีการศึกษา **2569** (active) · เปิดรับสมัคร · จำกัด 2 รายการ/คน
- Admin local: **`admin` / `admin1234`** (ล็อกอินฝั่ง "ครู/ผู้ดูแล")
- หมวดวิชา 4 หมวด + รายการตัวอย่าง 1 เดี่ยว + 1 ทีม

## 6. รัน

```bash
# โหมดพัฒนา
npm run dev           # http://localhost:5005

# โหมด production
npm run build
npm start             # หรือใช้ PM2 (ข้อ 7)
```

## 7. Deploy ด้วย PM2

```bash
npm run build
pm2 start ecosystem.config.js      # หรือ: pm2 start npm --name arena -- start
pm2 save
pm2 startup                        # ตั้งให้รันอัตโนมัติหลังรีบูต
```
เข้าใช้งานที่ `http://192.168.200.9:5005`

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

หมายเหตุ XAMPP = MariaDB → ไม่ใช้ native `json` (เก็บเป็น LONGTEXT + validate ที่ app layer)
