"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatThaiDate } from "@/lib/domain";
import type { ReportBundle } from "@/lib/reportBundle";

type DocType = "roster" | "scoresheet" | "announce";
const DOC_LABEL: Record<DocType, string> = {
  roster: "ใบรายชื่อ",
  scoresheet: "ใบกรอกคะแนน",
  announce: "ใบประกาศผล",
};

export function ReportsByEvent({
  yearBe,
  events,
  bundles,
}: {
  yearBe: number;
  events: { id: number; name: string }[];
  bundles: ReportBundle[];
}) {
  const [eventId, setEventId] = useState<number | null>(events[0]?.id ?? null);
  const [docType, setDocType] = useState<DocType>("roster");
  const [printing, setPrinting] = useState(false);

  const eventName = events.find((e) => e.id === eventId)?.name ?? "";
  const selectedBundles = useMemo(
    () => bundles.filter((b) => b.eventId === eventId),
    [bundles, eventId]
  );

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  return (
    <div className="stack">
      <div className="no-print row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>ออกรายงาน</h1>
          <div className="subtitle">เลือกงาน แล้วพิมพ์เอกสารรวมทุกรายการในงานนั้น · ปีการศึกษา {yearBe}</div>
        </div>
        <button
          className="btn btn-primary"
          disabled={!selectedBundles.length || printing}
          onClick={() => setPrinting(true)}
        >
          <Icon name="printer" size={18} /> {printing ? "กำลังเตรียมเอกสาร…" : `พิมพ์ (${selectedBundles.length})`}
        </button>
      </div>

      <div className="no-print card stack">
        <label className="field">
          <span>งาน</span>
          <select value={eventId ?? ""} onChange={(e) => setEventId(Number(e.target.value) || null)}>
            {!events.length && <option value="">— ยังไม่มีงาน —</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>

        <div>
          <label className="form-label">ประเภทเอกสาร</label>
          <div className="auth-tabs" style={{ maxWidth: 520 }}>
            {(Object.keys(DOC_LABEL) as DocType[]).map((t) => (
              <button key={t} className={`auth-tab${docType === t ? " active" : ""}`} onClick={() => setDocType(t)}>
                {DOC_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="alert alert-info">
          งานนี้มี {selectedBundles.length} รายการ — กด “พิมพ์” เพื่อสร้างเอกสาร (แต่ละรายการขึ้นหน้าใหม่)
        </div>
      </div>

      {printing && (
        <div className="print-only">
          {selectedBundles.map((b) => (
            <ReportSheet key={b.id} bundle={b} docType={docType} eventName={eventName} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportSheet({ bundle, docType, eventName }: { bundle: ReportBundle; docType: DocType; eventName: string }) {
  const { meta, criteria, fullScore, roster, results } = bundle;
  const timeStr = meta.eventDate
    ? `${formatThaiDate(meta.eventDate)}${meta.startTime ? ` เวลา ${meta.startTime.slice(0, 5)}–${meta.endTime?.slice(0, 5)} น.` : ""}`
    : "";

  return (
    <section className="report-section">
      <div className="print-title" style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>โรงเรียนสุคนธีรวิทย์</div>
        <div>{eventName}</div>
        <h2 style={{ margin: "8px 0 4px" }}>{DOC_LABEL[docType]}</h2>
        <div>รายการ: {meta.competitionName}{meta.groupName ? ` (${meta.groupName})` : ""}</div>
        {timeStr && <div className="text-sm">{timeStr}</div>}
      </div>

      {docType === "roster" && (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>ลำดับ</th>
              {meta.type === "team" && <th>ชื่อทีม</th>}
              <th>ชื่อ-สกุล</th>
              <th style={{ width: 90 }}>ชั้น</th>
              <th style={{ width: 70 }}>ห้อง</th>
            </tr>
          </thead>
          <tbody>
            {roster.flatMap((e, ei) =>
              e.members.map((m, mi) => (
                <tr key={`${e.entryId}-${m.studentCode}`}>
                  <td>{meta.type === "team" ? (mi === 0 ? ei + 1 : "") : ei + 1}</td>
                  {meta.type === "team" && <td>{mi === 0 ? e.teamName || `ทีม ${ei + 1}` : ""}</td>}
                  <td>{m.name}</td>
                  <td>{m.classLevel}</td>
                  <td>{m.classRoom}</td>
                </tr>
              ))
            )}
            {!roster.length && <tr><td colSpan={meta.type === "team" ? 5 : 4} className="text-center muted">ยังไม่มีผู้ลงทะเบียน</td></tr>}
          </tbody>
        </table>
      )}

      {docType === "scoresheet" && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>ลำดับ</th>
                <th>{meta.type === "team" ? "ทีม / สมาชิก" : "ชื่อ-สกุล"}</th>
                {criteria.map((c) => <th key={c.id} className="num">{c.name}<div className="text-xs">({c.max})</div></th>)}
                <th className="num">รวม ({fullScore})</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((e, i) => (
                <tr key={e.entryId} style={{ height: 44 }}>
                  <td>{i + 1}</td>
                  <td>
                    {meta.type === "team" && e.teamName && <div style={{ fontWeight: 600 }}>{e.teamName}</div>}
                    {e.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}
                  </td>
                  {criteria.map((c) => <td key={c.id} className="num"></td>)}
                  <td className="num"></td>
                </tr>
              ))}
              {!roster.length && <tr><td colSpan={criteria.length + 3} className="text-center muted">ยังไม่มีผู้ลงทะเบียน</td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 48, textAlign: "right", paddingRight: 24 }}>
            <div>ลงชื่อ ......................................................... กรรมการ</div>
            <div style={{ marginTop: 8 }}>( ......................................................... )</div>
          </div>
        </>
      )}

      {docType === "announce" && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>อันดับ</th>
                <th>{meta.type === "team" ? "ทีม / สมาชิก" : "ชื่อ-สกุล"}</th>
                {criteria.map((c) => <th key={c.id} className="num">{c.name}</th>)}
                <th className="num">รวม</th>
                <th style={{ width: 110 }}>เหรียญ</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.entryId}>
                  <td style={{ fontWeight: 700 }}>{r.rank}</td>
                  <td>
                    {meta.type === "team" && r.teamName && <div style={{ fontWeight: 600 }}>{r.teamName}</div>}
                    <div className="text-sm">{r.members.map((m) => `${m.name} (${m.classLevel}/${m.classRoom})`).join(", ")}</div>
                  </td>
                  {criteria.map((c) => <td key={c.id} className="num">{r.scoresByCriterion[c.id]?.toFixed(2) ?? "-"}</td>)}
                  <td className="num" style={{ fontWeight: 600 }}>{r.total.toFixed(2)}</td>
                  <td>{r.medalLabel}</td>
                </tr>
              ))}
              {!results.length && <tr><td colSpan={criteria.length + 4} className="text-center muted">ยังไม่มีผลการแข่งขัน</td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 48, textAlign: "right", paddingRight: 24 }}>
            <div>ลงชื่อ ......................................................... ประธานกรรมการ</div>
            <div style={{ marginTop: 8 }}>( ......................................................... )</div>
          </div>
        </>
      )}
    </section>
  );
}
