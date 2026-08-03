"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import type { CertIssueCompRow } from "@/lib/certIssuing";

// window.open ไม่ถูกเติม basePath (/arena) ให้อัตโนมัติเหมือน <Link> — ต้อง prefix เอง
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** ชั้นที่สองของหน้าออกเกียรติบัตร — รายการทั้งหมดในงานที่เลือก */
export function CertIssuePanel({
  eventName,
  rows,
  backHref,
}: {
  eventName: string;
  rows: CertIssueCompRow[];
  backHref: string;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function issue(r: CertIssueCompRow) {
    setBusyId(r.id);
    setMsg(null);
    const res = await api.post<{ issueIds: number[]; count: number; newCount: number }>(
      "/api/certificates/issue",
      { competitionId: r.id },
      // ออกเกียรติบัตรทั้งรายการทีเดียว (จองเลขทะเบียน + สร้าง QR ทุกใบ) — เผื่อเวลามากกว่าปกติ
      { timeoutMs: 60_000 }
    );
    setBusyId(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    if (!res.data.issueIds.length)
      return setMsg({ type: "error", text: "ไม่มีผู้เข้าแข่งขันให้ออกเกียรติบัตร" });

    // เปิดแท็บใหม่ไปหน้าพิมพ์ (ยกภาระ save PDF ให้ผู้ใช้)
    window.open(`${BASE}/certificates/print?ids=${res.data.issueIds.join(",")}`, "_blank");
    setMsg({
      type: "success",
      text: `ออกเกียรติบัตร ${res.data.count} ใบ (ใหม่ ${res.data.newCount} ใบ) — เปิดแท็บสำหรับพิมพ์แล้ว`,
    });
  }

  return (
    <div className="stack">
      <div className="page-bar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{eventName}</h1>
          <div className="subtitle">
            เลือกรายการเพื่อออกเกียรติบัตรให้ผู้เข้าร่วมทุกคน · ระบบจะเปิดแท็บใหม่ให้บันทึกเป็น PDF (Ctrl/⌘+P)
          </div>
        </div>
        <Link href={backHref} className="btn btn-sm">
          <Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> เลือกงานอื่น
        </Link>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {!rows.length ? (
        <div className="empty-state card">
          <Icon name="file" size={44} className="empty-ico" />
          <p>ยังไม่มีรายการในงานนี้ที่อยู่ในความดูแลของท่าน</p>
        </div>
      ) : (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead>
              <tr>
                <th>รายการแข่งขัน</th>
                <th>หมวด</th>
                <th className="num">ผู้เข้าร่วม</th>
                <th className="num">ออกแล้ว</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td-title">{r.name}</td>
                  <td data-label="หมวด">{r.groupName || <span className="muted">—</span>}</td>
                  <td className="num" data-label="ผู้เข้าร่วม">{r.activeEntries}</td>
                  <td className="num" data-label="ออกแล้ว">
                    {r.issuedCount > 0 ? `${r.issuedCount} ใบ` : <span className="muted">—</span>}
                  </td>
                  <td className="num td-actions">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {r.ready ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => issue(r)}
                          disabled={busyId === r.id}
                        >
                          <Icon name="printer" size={16} />{" "}
                          {busyId === r.id
                            ? "กำลังออก…"
                            : r.issuedCount > 0
                              ? "ออก/พิมพ์ซ้ำ"
                              : "ออกเกียรติบัตร"}
                        </button>
                      ) : (
                        <span className="badge">{r.reason}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
