#!/bin/sh
set -e

# ปรับ schema ให้ตรงกับ src/db/schema.ts แบบ force (push ตรง ไม่ผ่าน migration files)
echo "==> drizzle-kit push --force"
npm run db:push

# seed ข้อมูลตั้งต้น (idempotent — ข้ามให้เองถ้ามีอยู่แล้ว)
echo "==> seed ข้อมูลตั้งต้น"
npm run db:seed

echo "==> starting Next.js on :3017"
exec "$@"
