-- ===== Sukhon Arena — สร้าง database + user (PostgreSQL) =====
-- รันด้วย superuser:  psql -U postgres -f scripts/setup-db.sql
-- บน prod (192.168.200.9) Postgres อยู่ที่ port 5433 → ต้องใส่ -p 5433 ด้วย:
--   "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -p 5433 -f scripts/setup-db.sql
--
-- หมายเหตุ: PostgreSQL ไม่มี CREATE DATABASE/USER ... IF NOT EXISTS
-- ถ้ามีอยู่แล้วจะฟ้อง "already exists" — ข้ามบรรทัดนั้นได้ ไม่กระทบข้อมูลเดิม

CREATE DATABASE arena ENCODING 'UTF8';

-- สร้าง user แยก (อย่าใช้ postgres ใน production)
CREATE USER arena WITH PASSWORD 'arena_pass';
GRANT ALL PRIVILEGES ON DATABASE arena TO arena;

-- ต้องต่อเข้า database arena ก่อน จึงให้สิทธิ์ schema public ได้
-- (PostgreSQL 15 ขึ้นไปไม่ให้สิทธิ์เขียน schema public กับทุก user อัตโนมัติเหมือนรุ่นก่อน
--  ถ้าข้ามขั้นนี้จะเจอ error "permission denied for schema public" ตอนสร้างตาราง)
\connect arena
GRANT ALL ON SCHEMA public TO arena;

-- ⚠️ เปลี่ยน 'arena_pass' ให้ตรงกับ DATABASE_URL ใน .env
