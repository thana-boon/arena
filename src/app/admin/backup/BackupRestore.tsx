"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type RestoreResult = { summary: { table: string; rows: number }[]; total: number };

export function BackupRestore() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function restore() {
    if (!file) return;
    if (
      !window.confirm(
        "การกู้คืนจะลบข้อมูลปัจจุบันทั้งหมดแล้วเขียนทับด้วยไฟล์สำรองนี้\n" +
          "ข้อมูลที่มีอยู่ตอนนี้จะหายถาวรและกู้กลับไม่ได้\n\nยืนยันดำเนินการต่อ?"
      )
    )
      return;

    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await api.post<RestoreResult>("/api/admin/backup/restore", data);
      if (!res.ok) {
        setMsg({ type: "error", text: res.error });
      } else {
        setResult(res.data);
        setMsg({ type: "success", text: `กู้คืนข้อมูลสำเร็จ · ${res.data.total} รายการ` });
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMsg({ type: "error", text: "ไฟล์สำรองไม่ถูกต้อง (อ่าน JSON ไม่ได้)" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>สำรอง & กู้คืนข้อมูล</h1>
        <div className="subtitle">ดาวน์โหลดข้อมูลทั้งระบบเป็นไฟล์ หรือกู้คืนจากไฟล์ที่เคยสำรองไว้</div>
      </div>

      {/* สำรองข้อมูล */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}><Icon name="package" size={22} /> สำรองข้อมูล (Backup)</h3>
        <p className="muted">
          ดาวน์โหลดข้อมูลทั้งหมด (ปีการศึกษา, หมวดวิชา, รายการแข่งขัน, การลงทะเบียน, คะแนน, สิทธิ์ครู ฯลฯ)
          เป็นไฟล์ JSON ไฟล์เดียว เก็บไว้เป็นสำเนาสำรอง
        </p>
        <a className="btn btn-primary" href={`${BASE_PATH}/api/admin/backup`} download>
          <Icon name="download" size={18} /> ดาวน์โหลดไฟล์สำรอง
        </a>
      </div>

      {/* กู้คืนข้อมูล */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}><Icon name="restore" size={22} /> กู้คืนข้อมูล (Restore)</h3>
        <div className="alert alert-warning">
          <Icon name="warning" size={16} /> การกู้คืนจะ<strong>ลบข้อมูลปัจจุบันทั้งหมด</strong>แล้วเขียนทับด้วยไฟล์สำรอง —
          ควรดาวน์โหลดไฟล์สำรองล่าสุดไว้ก่อนทุกครั้ง
        </div>

        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

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

        <button className="btn btn-danger" disabled={!file || busy} onClick={restore}>
          {busy ? "กำลังกู้คืน…" : "กู้คืนข้อมูลจากไฟล์นี้"}
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
