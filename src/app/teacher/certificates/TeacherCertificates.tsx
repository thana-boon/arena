"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Row = {
  id: number;
  name: string;
  groupName: string;
  eventName: string | null;
  activeEntries: number;
  ready: boolean;
  reason: string;
};

export function TeacherCertificates({ rows }: { rows: Row[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  async function issue(r: Row) {
    setBusyId(r.id);
    setMsg(null);
    const res = await api.post<{ issueIds: number[]; count: number; newCount: number }>(
      "/api/certificates/issue",
      { competitionId: r.id }
    );
    setBusyId(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    if (!res.data.issueIds.length) return setMsg({ type: "error", text: "ไม่มีผู้เข้าแข่งขันให้ออกเกียรติบัตร" });

    // เปิดแท็บใหม่ไปหน้าพิมพ์ (ยกภาระ save PDF ให้ผู้ใช้)
    const ids = res.data.issueIds.join(",");
    window.open(`${BASE}/certificates/print?ids=${ids}`, "_blank");
    setMsg({
      type: "success",
      text: `ออกเกียรติบัตร ${res.data.count} ใบ (ใหม่ ${res.data.newCount} ใบ) — เปิดแท็บสำหรับพิมพ์แล้ว`,
    });
  }

  if (!rows.length) {
    return (
      <div className="empty-state card">
        <Icon name="file" size={44} className="empty-ico" />
        <p>ยังไม่มีรายการแข่งขันในความดูแลของท่าน</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {msg && <div className={`alert alert-${msg.type === "error" ? "error" : "success"}`}>{msg.text}</div>}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>รายการแข่งขัน</th>
              <th>หมวด</th>
              <th>งาน</th>
              <th style={{ textAlign: "center" }}>ผู้เข้าแข่ง</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.groupName}</td>
                <td>{r.eventName ?? <span className="subtitle">—</span>}</td>
                <td style={{ textAlign: "center" }}>{r.activeEntries}</td>
                <td style={{ textAlign: "right" }}>
                  {r.ready ? (
                    <button className="btn btn-sm btn-primary" onClick={() => issue(r)} disabled={busyId === r.id}>
                      <Icon name="printer" size={16} /> {busyId === r.id ? "กำลังออก…" : "ออกเกียรติบัตร"}
                    </button>
                  ) : (
                    <span className="badge">{r.reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
