import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { BackupFile } from "./backup";

/**
 * เก็บไฟล์สำรองไว้บนเซิร์ฟเวอร์ (นอกเหนือจากการดาวน์โหลดเป็นไฟล์)
 * - โฟลเดอร์: BACKUP_DIR หรือ <cwd>/backups — ใน container คือ /app/backups
 *   (docker-compose ครอบ volume ไว้ให้ ไฟล์จึงรอดตอน pull & redeploy)
 * - ชื่อไฟล์ระบบสร้างเองเสมอ และ validate ก่อนทุกครั้งที่รับชื่อจาก client (กัน path traversal)
 */

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

// อนุญาตเฉพาะรูปแบบชื่อที่ระบบสร้างเอง เช่น arena-backup-2569-07-23_143005.json
const NAME_RE = /^arena-backup-[A-Za-z0-9_.-]+\.json$/;

export type ServerBackup = { name: string; size: number; mtime: string };

export function isValidBackupName(name: string): boolean {
  return NAME_RE.test(name) && path.basename(name) === name;
}

function filePath(name: string): string {
  if (!isValidBackupName(name)) throw new Error("ชื่อไฟล์สำรองไม่ถูกต้อง");
  return path.join(BACKUP_DIR, name);
}

async function ensureDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

/** ตราเวลาแบบเวลาท้องถิ่น (TZ ของ container = Asia/Bangkok) ใช้เป็นส่วนหนึ่งของชื่อไฟล์ */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** รายชื่อไฟล์สำรองบนเซิร์ฟเวอร์ เรียงใหม่สุดก่อน */
export async function listServerBackups(): Promise<ServerBackup[]> {
  await ensureDir();
  const names = await fs.readdir(BACKUP_DIR);
  const out: ServerBackup[] = [];
  for (const name of names) {
    if (!isValidBackupName(name)) continue; // ข้ามไฟล์แปลกปลอมที่ไม่ใช่ของระบบ
    const st = await fs.stat(path.join(BACKUP_DIR, name));
    if (st.isFile()) out.push({ name, size: st.size, mtime: st.mtime.toISOString() });
  }
  out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return out;
}

/** เขียนไฟล์สำรองลงเซิร์ฟเวอร์ — suffix ใช้แยกไฟล์อัตโนมัติ เช่น "-before-restore" */
export async function saveServerBackup(data: BackupFile, suffix = ""): Promise<ServerBackup> {
  await ensureDir();
  const name = `arena-backup-${stamp()}${suffix}.json`;
  const fp = path.join(BACKUP_DIR, name);
  // compact JSON เหตุผลเดียวกับ endpoint ดาวน์โหลด (ข้อมูลส่วนใหญ่เป็น base64 รูปเกียรติบัตร)
  await fs.writeFile(fp, JSON.stringify(data), "utf8");
  const st = await fs.stat(fp);
  return { name, size: st.size, mtime: st.mtime.toISOString() };
}

/** อ่านไฟล์สำรองเป็น string (ผู้เรียก parse เอง) — โยน error ถ้าไม่มีไฟล์ */
export async function readServerBackup(name: string): Promise<string> {
  return fs.readFile(filePath(name), "utf8");
}

export async function deleteServerBackup(name: string): Promise<void> {
  await fs.unlink(filePath(name));
}
