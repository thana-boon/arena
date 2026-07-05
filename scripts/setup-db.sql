-- ===== Sukhon Arena — สร้าง database + user =====
-- รันด้วย root:  mysql -u root -p < scripts/setup-db.sql
-- (หรือ copy ไปวางใน phpMyAdmin > SQL)

CREATE DATABASE IF NOT EXISTS `compete`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- สร้าง user แยก (อย่าใช้ root ใน production)
CREATE USER IF NOT EXISTS 'compete_user'@'localhost' IDENTIFIED BY 'compete_pass';
GRANT ALL PRIVILEGES ON `compete`.* TO 'compete_user'@'localhost';
FLUSH PRIVILEGES;

-- ⚠️ เปลี่ยน 'compete_pass' ให้ตรงกับ DATABASE_URL ใน .env
