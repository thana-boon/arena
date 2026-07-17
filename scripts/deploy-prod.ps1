# Deploy สำหรับรัน "บนเครื่อง prod" (192.168.200.9)
# ทับ 4 อย่างจาก source → D:\API\arena, ติดตั้ง dep, build, sync schema, restart PM2
#
# วิธีใช้ (บนเครื่อง prod, PowerShell):
#   .\deploy-prod.ps1 -Source "\\192.168.8.245\...\arena"     # ชี้ไปที่โฟลเดอร์ dev ที่มีไฟล์ใหม่
#   .\deploy-prod.ps1 -Source "C:\staging\arena" -SkipDbPush  # ถ้าไม่ต้องการ push schema
#
# ต้องมีสิทธิ์อ่าน -Source จากเครื่อง prod (share/USB/โฟลเดอร์ที่ก๊อปมาวางไว้ก่อน)

param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Target = "D:\API\arena",
  [string]$Pm2Name = "arena",
  [switch]$SkipDbPush
)

$ErrorActionPreference = "Stop"
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

if (-not (Test-Path $Target)) { throw "ไม่พบโฟลเดอร์ปลายทาง: $Target" }
foreach ($item in @("drizzle", "src", "package.json", "package-lock.json")) {
  if (-not (Test-Path (Join-Path $Source $item))) { throw "ไม่พบ '$item' ใน source: $Source" }
}

# 1) สำรอง drizzle+src เดิมไว้ก่อนทับ (กันพลาด — ย้อนกลับได้)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $Target ".deploy-backup\$stamp"
Step "สำรองของเดิมไปที่ $backup"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
foreach ($item in @("drizzle", "src", "package.json", "package-lock.json")) {
  $cur = Join-Path $Target $item
  if (Test-Path $cur) { Copy-Item $cur -Destination $backup -Recurse -Force }
}

# 2) ทับไฟล์ใหม่ (mirror สำหรับโฟลเดอร์ เพื่อลบไฟล์ที่ถูกลบไปแล้วออกด้วย)
Step "คัดลอกไฟล์ใหม่ทับ"
robocopy (Join-Path $Source "drizzle") (Join-Path $Target "drizzle") /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy (Join-Path $Source "src")     (Join-Path $Target "src")     /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Copy-Item (Join-Path $Source "package.json")      (Join-Path $Target "package.json")      -Force
Copy-Item (Join-Path $Source "package-lock.json") (Join-Path $Target "package-lock.json") -Force
# robocopy exit code < 8 = สำเร็จ; รีเซ็ต $LASTEXITCODE ไม่ให้หลุด try
if ($LASTEXITCODE -lt 8) { $global:LASTEXITCODE = 0 }

Set-Location $Target

# 3) ติดตั้ง dependency ตาม lockfile (จำเป็น — รอบนี้เพิ่ม qrcode)
Step "npm ci"
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci ล้มเหลว" }

# 4) sync schema เข้า DB prod (สร้างตารางเกียรติบัตรใหม่) — drizzle-kit push --force
if (-not $SkipDbPush) {
  Step "npm run db:push (sync schema → เพิ่มตารางเกียรติบัตร)"
  npm run db:push
  if ($LASTEXITCODE -ne 0) { throw "db:push ล้มเหลว — ตรวจ DATABASE_URL ใน .env (ต้องชี้ Postgres :5433 ของ arena ไม่ใช่ :5432 ของ HikCentral)" }
} else {
  Write-Host "`n(ข้าม db:push ตามที่สั่ง — ระวังหน้าเกียรติบัตรจะ error ถ้ายังไม่มีตาราง)" -ForegroundColor Yellow
}

# 5) build
Step "npm run build"
npm run build
if ($LASTEXITCODE -ne 0) { throw "build ล้มเหลว — ยังไม่ restart PM2 ของเดิมจึงยังรันอยู่" }

# 6) restart PM2
Step "pm2 restart $Pm2Name"
pm2 restart $Pm2Name --update-env
if ($LASTEXITCODE -ne 0) { throw "pm2 restart ล้มเหลว" }

Step "เสร็จสมบูรณ์"
pm2 status $Pm2Name
Write-Host "`nถ้าผิดพลาด ย้อนกลับได้จาก: $backup" -ForegroundColor DarkGray
