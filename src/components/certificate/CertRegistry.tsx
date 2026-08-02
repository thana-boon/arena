"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { AWARD_LABEL, rankAwardLabel, type CertAward } from "@/lib/domain";

// window.open ไม่ถูกเติม basePath ให้อัตโนมัติเหมือน <Link>/router.push — ต้อง prefix เอง
// (api.* เติม basePath ให้ในตัวแล้ว ห้ามใส่ซ้ำ ไม่งั้นกลายเป็น /arena/arena/... แล้ว 404)
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Row = {
  key: string;
  studentCode: string;
  name: string;
  classText: string;
  yearBe: number;
  eventName: string;
  competitionId: number;
  competitionName: string;
  teamName: string | null;
  entryId: number;
  withdrawn: boolean;
  issueId: number | null;
  serialNo: string | null;
  award: CertAward | null;
  rank: number;
  revoked: boolean;
  canIssue: boolean;
  blockReason: string;
};

type IssueResp = {
  issues: { id: number; studentCode: string; entryId: number }[];
  count: number;
  newCount: number;
};

const openPrint = (ids: number[]) => {
  if (ids.length) window.open(`${BASE}/certificates/print?ids=${ids.join(",")}`, "_blank");
};

export function CertRegistry() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await api.get<{ rows: Row[] }>(`/api/certificates/registry?q=${encodeURIComponent(q)}`);
    setBusy(false);
    if (!res.ok) {
      setRows(null);
      return setMsg({ type: "error", text: res.error });
    }
    setRows(res.data.rows);
  }

  /** ออกใบให้แถวที่ยังไม่เคยออก — ทีมจะออกครบทั้งทีม แต่เปิดพิมพ์เฉพาะใบของคนที่ค้นหา */
  async function issue(r: Row) {
    setBusyKey(r.key);
    setMsg(null);
    const res = await api.post<IssueResp>(
      "/api/certificates/issue",
      { competitionId: r.competitionId, entryIds: [r.entryId] },
      { timeoutMs: 60_000 }
    );
    setBusyKey(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });

    const mine = res.data.issues.find((i) => i.studentCode === r.studentCode);
    if (!mine) return setMsg({ type: "error", text: "ออกใบสำเร็จ แต่ไม่พบใบของนักเรียนคนนี้" });

    // อัปเดตแถวในตารางทันที ไม่ต้องให้ผู้ใช้กดค้นใหม่
    setRows((prev) =>
      prev
        ? prev.map((x) => (x.key === r.key ? { ...x, issueId: mine.id, canIssue: false } : x))
        : prev
    );
    openPrint([mine.id]);
    setMsg({
      type: "success",
      text:
        res.data.count > 1
          ? `ออกเกียรติบัตรของทีมนี้ ${res.data.count} ใบ (ใหม่ ${res.data.newCount} ใบ) — เปิดแท็บพิมพ์เฉพาะใบของ ${r.name}`
          : `ออกเกียรติบัตรแล้ว — เปิดแท็บสำหรับพิมพ์`,
    });
  }

  // จัดกลุ่มตามรหัสนักเรียน — ค้นด้วยชื่ออาจเจอหลายคนชื่อซ้ำ ต้องแยกให้เห็นชัด
  const groups = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const list = map.get(r.studentCode);
      if (list) list.push(r);
      else map.set(r.studentCode, [r]);
    }
    return [...map.entries()].map(([studentCode, list]) => ({
      studentCode,
      // ชื่อ/ชั้นจากแถวปีล่าสุด (rows เรียงปีมาก→น้อยมาแล้ว)
      name: list[0].name,
      classText: list[0].classText,
      rows: list,
      printable: list.filter((r) => r.issueId != null && !r.revoked).map((r) => r.issueId as number),
    }));
  }, [rows]);

  return (
    <div className="stack">
      <div className="card">
        <form onSubmit={search} className="filter-bar">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
            <label className="form-label">รหัสนักเรียน หรือ ชื่อ-สกุล</label>
            <input
              className="form-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="เช่น 10234 หรือ สมชาย"
              autoFocus
            />
          </div>
          <button className="btn btn-primary" disabled={busy || q.trim().length < 2}>
            <Icon name="search" size={16} /> {busy ? "กำลังค้น…" : "ค้นหา"}
          </button>
        </form>
        <div className="subtitle mt-2">
          ค้นจากทะเบียนของโรงเรียนโดยตรง ครอบคลุมทุกปีการศึกษา — นักเรียนที่จบหรือลาออกไปแล้วก็ยังค้นเจอ
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {rows && !rows.length && (
        <div className="empty-state card">
          <Icon name="search" size={44} className="empty-ico" />
          <p>ไม่พบรายชื่อที่ตรงกับ “{q}”</p>
          <div className="subtitle">ลองใช้รหัสนักเรียน หรือพิมพ์เฉพาะชื่อต้นโดยไม่ใส่คำนำหน้า</div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.studentCode} className="card stack">
          <div className="page-bar">
            <div>
              <h3 style={{ margin: 0 }}>{g.name}</h3>
              <div className="subtitle">
                รหัส {g.studentCode}
                {g.classText && ` · ${g.classText} (ณ ปีล่าสุดที่พบ)`} · {g.rows.length} รายการ
              </div>
            </div>
            {g.printable.length > 1 && (
              <button className="btn btn-secondary btn-sm" onClick={() => openPrint(g.printable)}>
                <Icon name="printer" size={16} /> พิมพ์ทุกใบ ({g.printable.length})
              </button>
            )}
          </div>

          <div className="table-wrap table-cards">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>ปี</th>
                  <th>งาน / รายการ</th>
                  <th>ชั้น</th>
                  <th>รางวัล</th>
                  <th>เลขทะเบียน</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="hide-sm" style={{ whiteSpace: "nowrap" }}>{r.yearBe}</td>
                    <td className="td-title">
                      <div>{r.competitionName}</div>
                      <div className="subtitle">
                        <span className="only-sm">ปี {r.yearBe} · </span>
                        {r.eventName || "—"}
                        {r.teamName && ` · ทีม ${r.teamName}`}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }} data-label="ชั้น">{r.classText || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }} data-label="รางวัล">
                      {r.issueId == null ? (
                        <span className="subtitle">—</span>
                      ) : (
                        <span>
                          {r.award ? AWARD_LABEL[r.award] : "—"}
                          {r.rank > 0 && <div className="subtitle">{rankAwardLabel(r.rank)}</div>}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }} data-label="เลขทะเบียน">
                      {r.serialNo ?? <span className="subtitle">ยังไม่ออกใบ</span>}
                    </td>
                    <td className="td-actions" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                      {r.revoked ? (
                        <span className="badge badge-warning">ยกเลิกแล้ว</span>
                      ) : r.issueId != null ? (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openPrint([r.issueId as number])}
                        >
                          <Icon name="printer" size={16} /> พิมพ์ซ้ำ
                        </button>
                      ) : r.canIssue ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => issue(r)}
                          disabled={busyKey === r.key}
                        >
                          <Icon name="file" size={16} /> {busyKey === r.key ? "กำลังออก…" : "ออกใบ"}
                        </button>
                      ) : (
                        <span className="badge">{r.blockReason}</span>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
