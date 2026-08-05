"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatThaiDate, progressPercent } from "@/lib/domain";
import type { PublishRow } from "@/lib/publishBoard";

type StatusFilter = "all" | "pending" | "published";

const STATE_HINT: Record<PublishRow["state"], string> = {
  empty: "ยังไม่ได้กรอกคะแนน",
  partial: "กรอกคะแนนยังไม่ครบ",
  complete: "กรอกคะแนนครบแล้ว",
};

export function PublishTable({
  rows,
  scoreBasePath,
  defaultEventId = null,
}: {
  rows: PublishRow[];
  scoreBasePath: string;
  defaultEventId?: number | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [groupFilter, setGroupFilter] = useState<number | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  // งานที่มีในรายการ (ไม่ซ้ำ) — ค่าเริ่มต้นคืองานที่ admin ตั้งไว้ ถ้ามีรายการอยู่ในงานนั้นจริง
  const eventOptions = useMemo(() => {
    const seen = new Map<number, { id: number; name: string }>();
    for (const r of rows) {
      const eid = r.eventId ?? -1;
      if (!seen.has(eid)) seen.set(eid, { id: eid, name: r.eventName || "ไม่ระบุงาน" });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rows]);
  const [eventFilter, setEventFilter] = useState<number | "all">(() =>
    defaultEventId != null && rows.some((r) => r.eventId === defaultEventId) ? defaultEventId : "all"
  );

  const inEvent = useMemo(
    () => (eventFilter === "all" ? rows : rows.filter((r) => (r.eventId ?? -1) === eventFilter)),
    [rows, eventFilter]
  );

  const groups = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; catalogNo: number | null }>();
    for (const r of inEvent) {
      const gid = r.subjectGroupId ?? -1;
      if (!seen.has(gid)) seen.set(gid, { id: gid, name: r.groupName || "ทั่วไป", catalogNo: r.groupCatalogNo });
    }
    return [...seen.values()].sort(
      (a, b) => (a.catalogNo ?? 9999) - (b.catalogNo ?? 9999) || a.name.localeCompare(b.name, "th")
    );
  }, [inEvent]);

  // ฐานของ % ความคืบหน้า = งาน + หมวดที่เลือกอยู่ (ไม่รวมตัวกรองสถานะ — ไม่งั้นกด "ยังไม่ประกาศ" แล้ว % กลายเป็น 0 ทุกครั้ง)
  const scoped = useMemo(
    () => (groupFilter === "all" ? inEvent : inEvent.filter((r) => (r.subjectGroupId ?? -1) === groupFilter)),
    [inEvent, groupFilter]
  );
  const publishedCount = scoped.filter((r) => r.isPublished).length;
  const pendingCount = scoped.length - publishedCount;
  const percent = progressPercent(publishedCount, scoped.length);

  const shown = useMemo(
    () =>
      status === "all" ? scoped : scoped.filter((r) => (status === "published" ? r.isPublished : !r.isPublished)),
    [scoped, status]
  );

  async function togglePublish(r: PublishRow) {
    // ประกาศทั้งที่คะแนนยังไม่ครบ = ผลที่ออกสู่สาธารณะจะเพี้ยน (คนที่ยังไม่มีคะแนนจะรั้งท้าย) — เตือนก่อน
    if (!r.isPublished && r.state !== "complete") {
      const ok = await confirm({
        title: "คะแนนยังไม่ครบ",
        message:
          r.state === "empty"
            ? `รายการ "${r.name}" ยังไม่ได้กรอกคะแนนเลย ถ้าประกาศตอนนี้ผู้เข้าแข่งขันทุกคนจะได้ 0 คะแนน ยืนยันประกาศผลหรือไม่?`
            : `รายการ "${r.name}" กรอกคะแนนแล้ว ${r.scoredEntries} จาก ${r.entries} ราย คนที่ยังไม่มีคะแนนจะถูกจัดอันดับด้วยคะแนน 0 ยืนยันประกาศผลหรือไม่?`,
        confirmText: "ประกาศผล",
      });
      if (!ok) return;
    }
    if (r.isPublished) {
      const ok = await confirm({
        title: "ยกเลิกการประกาศผล",
        message: `ผลของ "${r.name}" จะถูกซ่อนจากหน้าประกาศผลสาธารณะทันที และออกเกียรติบัตรไม่ได้จนกว่าจะประกาศใหม่ ยืนยันหรือไม่?`,
        confirmText: "ยกเลิกประกาศ",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(r.id);
    setMsg(null);
    const res = await api.post(`/api/competitions/${r.id}/publish`, { isPublished: !r.isPublished });
    setBusy(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setMsg({ type: "success", text: r.isPublished ? `ยกเลิกประกาศ "${r.name}" แล้ว` : `ประกาศผล "${r.name}" แล้ว` });
    router.refresh();
  }

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {eventOptions.length > 1 && (
        <div className="filter-bar">
          <label className="field" style={{ maxWidth: 360 }}>
            <span>งาน</span>
            <select
              className="form-select"
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value === "all" ? "all" : Number(e.target.value));
                setGroupFilter("all"); // งานเปลี่ยน หมวดเดิมอาจไม่มีในงานใหม่
              }}
            >
              <option value="all">ทุกงาน ({rows.length})</option>
              {eventOptions.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({rows.filter((r) => (r.eventId ?? -1) === ev.id).length})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {groups.length > 1 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <button
            className={`btn btn-sm ${groupFilter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setGroupFilter("all")}
          >
            ทุกหมวด ({inEvent.length})
          </button>
          {groups.map((g) => {
            const inGroup = inEvent.filter((r) => (r.subjectGroupId ?? -1) === g.id);
            const done = inGroup.filter((r) => r.isPublished).length;
            return (
              <button
                key={g.id}
                className={`btn btn-sm ${groupFilter === g.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setGroupFilter(g.id)}
              >
                {g.name} ({done}/{inGroup.length})
              </button>
            );
          })}
        </div>
      )}

      <div className="card card-pad">
        <div className="row between" style={{ alignItems: "baseline" }}>
          <div>
            <div style={{ fontWeight: 600 }}>ประกาศผลไปแล้ว</div>
            <div className="text-sm muted">
              {publishedCount} จาก {scoped.length} รายการ · เหลืออีก {pendingCount} รายการ
            </div>
          </div>
          <div className="publish-percent">{percent}%</div>
        </div>
        <div className="progress mt-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <button className={`btn btn-sm ${status === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus("all")}>
          ทั้งหมด ({scoped.length})
        </button>
        <button
          className={`btn btn-sm ${status === "pending" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setStatus("pending")}
        >
          ยังไม่ประกาศ ({pendingCount})
        </button>
        <button
          className={`btn btn-sm ${status === "published" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setStatus("published")}
        >
          ประกาศแล้ว ({publishedCount})
        </button>
      </div>

      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th>หมวด</th>
              <th className="num">คะแนนที่กรอก</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!shown.length && (
              <tr>
                <td colSpan={5} className="muted text-sm" style={{ textAlign: "center", padding: 16 }}>
                  ไม่มีรายการตามตัวกรองที่เลือก
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="td-title">
                  <Link href={`${scoreBasePath}/${r.id}`} style={{ fontWeight: 500 }}>
                    {r.name}
                  </Link>
                  <div className="text-xs muted">
                    {r.eventName}
                    {r.eventDate ? ` · ${formatThaiDate(r.eventDate)}` : ""}
                  </div>
                </td>
                <td className="text-sm" data-label="หมวด">
                  {r.groupName || "ทั่วไป"}
                </td>
                <td className="num" data-label="คะแนนที่กรอก">
                  <span className={r.state === "complete" ? "" : "muted"}>
                    {r.scoredEntries}/{r.entries}
                  </span>
                  <div className="text-xs muted">{STATE_HINT[r.state]}</div>
                </td>
                <td data-label="สถานะ">
                  {r.isPublished ? (
                    <span className="badge badge-success">ประกาศแล้ว</span>
                  ) : (
                    <span className="badge badge-warning">ยังไม่ประกาศ</span>
                  )}
                </td>
                <td className="num td-actions">
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <Link href={`${scoreBasePath}/${r.id}`} className="btn btn-ghost btn-sm">
                      บันทึกคะแนน
                    </Link>
                    <button
                      className={`btn btn-sm ${r.isPublished ? "btn-secondary" : "btn-accent"}`}
                      disabled={busy === r.id}
                      onClick={() => togglePublish(r)}
                    >
                      {busy === r.id ? "กำลังบันทึก…" : r.isPublished ? "ยกเลิกประกาศ" : "ประกาศผล"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
