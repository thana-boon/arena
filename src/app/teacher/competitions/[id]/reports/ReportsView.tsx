"use client";
import { useState } from "react";
import type { RosterEntry } from "@/lib/roster";
import { formatThaiDate } from "@/lib/domain";

type Meta = {
  competitionName: string;
  groupName: string;
  type: "individual" | "team";
  yearBe: number;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
};
type Crit = { id: number; name: string; max: number };
type ResultRow = {
  entryId: number;
  teamName: string | null;
  members: { studentCode: string; name: string; classLevel: string; classRoom: string }[];
  scoresByCriterion: Record<number, number>;
  total: number;
  percent: number;
  rank: number;
  medalLabel: string;
};

type Tab = "roster" | "scoresheet" | "announce";

export function ReportsView({
  meta,
  criteria,
  fullScore,
  roster,
  results,
}: {
  meta: Meta;
  criteria: Crit[];
  fullScore: number;
  roster: RosterEntry[];
  results: ResultRow[];
}) {
  const [tab, setTab] = useState<Tab>("roster");

  const timeStr = meta.eventDate
    ? `${formatThaiDate(meta.eventDate)}${meta.startTime ? ` เวลา ${meta.startTime.slice(0, 5)}–${meta.endTime?.slice(0, 5)} น.` : ""}`
    : "";

  const SchoolHeader = () => (
    <div className="print-title" style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--font-th-serif)", fontSize: 16, fontWeight: 700 }}>โรงเรียนสุคนธีรวิทย์</div>
      <div style={{ fontSize: 16 }}>งานแข่งขันทางวิชาการ ปีการศึกษา {meta.yearBe}</div>
    </div>
  );

  return (
    <div className="stack">
      <div className="no-print row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>เอกสาร / รายงาน</h1>
          <div className="subtitle">{meta.competitionName}</div>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>🖨️ พิมพ์ (Ctrl+P)</button>
      </div>

      <div className="no-print auth-tabs" style={{ maxWidth: 520 }}>
        <button className={`auth-tab${tab === "roster" ? " active" : ""}`} onClick={() => setTab("roster")}>ใบรายชื่อ</button>
        <button className={`auth-tab${tab === "scoresheet" ? " active" : ""}`} onClick={() => setTab("scoresheet")}>ใบกรอกคะแนน</button>
        <button className={`auth-tab${tab === "announce" ? " active" : ""}`} onClick={() => setTab("announce")}>ใบประกาศผล</button>
      </div>

      <div className="card">
        <SchoolHeader />
        <div className="print-title" style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 4, fontSize: 16 }}>
            {tab === "roster" && "ใบรายชื่อผู้เข้าแข่งขัน"}
            {tab === "scoresheet" && "ใบกรอกคะแนน"}
            {tab === "announce" && "ใบประกาศผลการแข่งขัน"}
          </h2>
          <div>รายการ: {meta.competitionName} ({meta.groupName})</div>
          {timeStr && <div className="text-sm">{timeStr}</div>}
        </div>

        {/* ===== 1. ใบรายชื่อ ===== */}
        {tab === "roster" && (
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

        {/* ===== 2. ใบกรอกคะแนน ===== */}
        {tab === "scoresheet" && (
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
              </tbody>
            </table>
            <div style={{ marginTop: 48, textAlign: "right", paddingRight: 24 }}>
              <div>ลงชื่อ ......................................................... กรรมการ</div>
              <div style={{ marginTop: 8 }}>( ......................................................... )</div>
            </div>
          </>
        )}

        {/* ===== 3. ใบประกาศผล ===== */}
        {tab === "announce" && (
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
      </div>
    </div>
  );
}
