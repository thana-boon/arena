"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type RestoreResult = { summary: { table: string; rows: number }[]; total: number; safetyFile?: string };
export type ServerBackup = { name: string; size: number; mtime: string };

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function BackupRestore({ initialFiles }: { initialFiles: ServerBackup[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<ServerBackup[]>(initialFiles);
  // busy เก็บ key ของงานที่กำลังทำ ("save" | "upload" | ชื่อไฟล์) — กันกดซ้ำ/กดข้ามปุ่ม
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function refreshFiles() {
    const res = await api.get<{ files: ServerBackup[] }>("/api/admin/backup/files");
    if (res.ok) setFiles(res.data.files);
  }

  // สำรองตอนนี้ → บันทึกเป็นไฟล์บนเซิร์ฟเวอร์
  async function saveToServer() {
    setBusy("save");
    setMsg(null);
    setResult(null);
    const res = await api.post<{ file: ServerBackup }>("/api/admin/backup/files");
    if (!res.ok) setMsg({ type: "error", text: res.error });
    else {
      setMsg({ type: "success", text: `สำรองข้อมูลลงเซิร์ฟเวอร์แล้ว · ${res.data.file.name}` });
      await refreshFiles();
    }
    setBusy(null);
  }

  function confirmRestore(label: string): boolean {
    return window.confirm(
      `การกู้คืนจะลบข้อมูลปัจจุบันทั้งหมดแล้วเขียนทับด้วย${label}\n` +
        "(ระบบสำรองข้อมูลปัจจุบันเก็บไว้บนเซิร์ฟเวอร์ให้อัตโนมัติก่อนกู้คืน)\n\nยืนยันดำเนินการต่อ?"
    );
  }

  function applyRestoreResult(res: Awaited<ReturnType<typeof api.post<RestoreResult>>>) {
    if (!res.ok) {
      setMsg({ type: "error", text: res.error });
    } else {
      setResult(res.data);
      setMsg({
        type: "success",
        text:
          `กู้คืนข้อมูลสำเร็จ · ${res.data.total} รายการ` +
          (res.data.safetyFile ? ` — ข้อมูลก่อนกู้คืนถูกสำรองไว้ที่ ${res.data.safetyFile}` : ""),
      });
      router.refresh();
    }
  }

  // กู้คืนจากไฟล์ที่เก็บบนเซิร์ฟเวอร์
  async function restoreFromServer(name: string) {
    if (!confirmRestore(`ไฟล์ "${name}"`)) return;
    setBusy(name);
    setMsg(null);
    setResult(null);
    const res = await api.post<RestoreResult>(`/api/admin/backup/files/${encodeURIComponent(name)}`);
    applyRestoreResult(res);
    await refreshFiles(); // มีไฟล์ -before-restore เพิ่มเข้ามา
    setBusy(null);
  }

  async function deleteFromServer(name: string) {
    if (!window.confirm(`ลบไฟล์สำรอง "${name}" ออกจากเซิร์ฟเวอร์?`)) return;
    setBusy(name);
    setMsg(null);
    const res = await api.del(`/api/admin/backup/files/${encodeURIComponent(name)}`);
    if (!res.ok) setMsg({ type: "error", text: res.error });
    await refreshFiles();
    setBusy(null);
  }

  // กู้คืนจากไฟล์ที่อัปโหลดจากเครื่องผู้ใช้
  async function restoreFromUpload() {
    if (!file) return;
    if (!confirmRestore("ไฟล์สำรองนี้")) return;

    setBusy("upload");
    setMsg(null);
    setResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await api.post<RestoreResult>("/api/admin/backup/restore", data);
      applyRestoreResult(res);
      if (res.ok) {
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
      await refreshFiles();
    } catch {
      setMsg({ type: "error", text: "ไฟล์สำรองไม่ถูกต้อง (อ่าน JSON ไม่ได้)" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สำรอง & กู้คืนข้อมูล</h1>
        <div className="subtitle">สำรองข้อมูลเก็บบนเซิร์ฟเวอร์หรือดาวน์โหลดเป็นไฟล์ และกู้คืนได้จากทั้งสองแบบ</div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* สำรองข้อมูล */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}><Icon name="package" size={22} /> สำรองข้อมูล (Backup)</h3>
        <p className="muted">
          สำรองข้อมูลทั้งหมด (ปีการศึกษา, หมวดวิชา, รายการแข่งขัน, การลงทะเบียน, คะแนน, สิทธิ์ครู ฯลฯ)
          เป็นไฟล์ JSON ไฟล์เดียว — เก็บไว้บนเซิร์ฟเวอร์ (กู้คืนได้ในคลิกเดียว) หรือดาวน์โหลดมาเก็บที่เครื่อง
        </p>
        <div className="row">
          <button className="btn btn-primary" disabled={busy !== null} onClick={saveToServer}>
            <Icon name="package" size={18} /> {busy === "save" ? "กำลังสำรอง…" : "สำรองลงเซิร์ฟเวอร์"}
          </button>
          <a className="btn btn-secondary" href={`${BASE_PATH}/api/admin/backup`} download>
            <Icon name="download" size={18} /> ดาวน์โหลดเป็นไฟล์
          </a>
        </div>
      </div>

      {/* ไฟล์สำรองบนเซิร์ฟเวอร์ */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}><Icon name="clipboard" size={22} /> ไฟล์สำรองบนเซิร์ฟเวอร์</h3>
        {files.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>ไฟล์</th>
                <th style={{ width: 90 }} className="num">ขนาด</th>
                <th style={{ width: 170 }}>วันที่สำรอง</th>
                <th style={{ width: 240 }}></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name}>
                  <td style={{ wordBreak: "break-all" }}>{f.name}</td>
                  <td className="num">{fmtSize(f.size)}</td>
                  <td>{fmtDate(f.mtime)}</td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <button className="btn btn-danger btn-sm" disabled={busy !== null} onClick={() => restoreFromServer(f.name)}>
                        {busy === f.name ? "กำลังทำงาน…" : "กู้คืน"}
                      </button>
                      <a className="btn btn-secondary btn-sm" href={`${BASE_PATH}/api/admin/backup/files/${encodeURIComponent(f.name)}`} download>
                        ดาวน์โหลด
                      </a>
                      <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => deleteFromServer(f.name)}>
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>ยังไม่มีไฟล์สำรองบนเซิร์ฟเวอร์ — กด “สำรองลงเซิร์ฟเวอร์” เพื่อสร้างไฟล์แรก</p>
        )}
      </div>

      {/* กู้คืนจากไฟล์ในเครื่อง */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}><Icon name="restore" size={22} /> กู้คืนจากไฟล์ในเครื่อง (Restore)</h3>
        <div className="alert alert-warning">
          <Icon name="warning" size={16} /> การกู้คืนจะ<strong>ลบข้อมูลปัจจุบันทั้งหมด</strong>แล้วเขียนทับด้วยไฟล์สำรอง —
          ระบบจะสำรองข้อมูลปัจจุบันเก็บไว้บนเซิร์ฟเวอร์ให้อัตโนมัติก่อนกู้คืนทุกครั้ง
        </div>

        <div className="form-group">
          <label className="form-label">เลือกไฟล์สำรอง (.json)</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="form-input"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setMsg(null);
              setResult(null);
            }}
          />
        </div>

        <button className="btn btn-danger" disabled={!file || busy !== null} onClick={restoreFromUpload}>
          {busy === "upload" ? "กำลังกู้คืน…" : "กู้คืนข้อมูลจากไฟล์นี้"}
        </button>

        {result && (
          <table className="table" style={{ marginTop: "var(--space-4)" }}>
            <thead>
              <tr>
                <th>ตาราง</th>
                <th className="num">จำนวนรายการ</th>
              </tr>
            </thead>
            <tbody>
              {result.summary.map((r) => (
                <tr key={r.table}>
                  <td>{r.table}</td>
                  <td className="num">{r.rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
