import { formatThaiDate, formatLevels, hhmm, isUnlimited } from "@/lib/domain";
import type { ReportBundle } from "@/lib/reportBundle";

export type DocType = "roster" | "scoresheet" | "announce" | "summary" | "regcount";
export const DOC_LABEL: Record<DocType, string> = {
  roster: "ใบรายชื่อ",
  scoresheet: "ใบกรอกคะแนน",
  announce: "ใบประกาศผล",
  summary: "สรุปรายการแข่งขัน",
  regcount: "สรุปยอดผู้สมัคร",
};
/** เอกสารสรุป = ตารางรวมฉบับเดียวทั้งงาน (ไม่แยกหน้าใหม่ต่อรายการ) — แสดงตัวอย่างบนจอได้เลย */
export const SUMMARY_DOCS: DocType[] = ["summary", "regcount"];

/** ป้ายประเภท เช่น "เดี่ยว" / "ทีม 2–5 คน" */
function typeLabel(b: ReportBundle): string {
  if (b.meta.type !== "team") return "เดี่ยว";
  const { teamSizeMin: mn, teamSizeMax: mx } = b;
  if (mn && mx) return mn === mx ? `ทีม ${mn} คน` : `ทีม ${mn}–${mx} คน`;
  if (mn) return `ทีม ≥${mn} คน`;
  if (mx) return `ทีม ≤${mx} คน`;
  return "ทีม";
}

/** ข้อความจำนวนรับ — ไม่จำกัด → "ไม่จำกัดจำนวน" */
function capacityLabel(b: ReportBundle): string {
  if (isUnlimited(b.capacity)) return "ไม่จำกัดจำนวน";
  return `${b.capacity} ${b.meta.type === "team" ? "ทีม" : "คน"}`;
}

/** จัดกลุ่ม bundle ตามหมวด (คงลำดับที่เรียงมาแล้วจากเซิร์ฟเวอร์: หมวด → ชื่อรายการ) */
function groupBySubject(bundles: ReportBundle[]): { groupName: string; items: ReportBundle[] }[] {
  const out: { groupName: string; items: ReportBundle[] }[] = [];
  for (const b of bundles) {
    const last = out[out.length - 1];
    if (last && last.groupName === b.groupName) last.items.push(b);
    else out.push({ groupName: b.groupName, items: [b] });
  }
  return out;
}

/** เอกสารสรุปทั้งงาน: ตารางรวมรายการ (summary) / ยอดผู้สมัคร (regcount) แยกหัวข้อตามหมวด */
export function SummarySheet({
  bundles,
  docType,
  eventName,
  yearBe,
}: {
  bundles: ReportBundle[];
  docType: "summary" | "regcount";
  eventName: string;
  yearBe: number;
}) {
  const groups = groupBySubject(bundles);
  const totalStudents = bundles.reduce((s, b) => s + b.studentCount, 0);

  return (
    <section className="report-section report-web" style={{ breakBefore: "auto" }}>
      <div className="print-title" style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>โรงเรียนสุคนธีรวิทย์</div>
        <div>{eventName}</div>
        <h2 style={{ margin: "8px 0 4px" }}>{DOC_LABEL[docType]}</h2>
        <div className="text-sm">
          ปีการศึกษา {yearBe} · {bundles.length} รายการ
          {docType === "regcount" && ` · ผู้สมัครรวม ${totalStudents} คน`}
        </div>
      </div>

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="table">
          <thead>
            {docType === "summary" ? (
              <tr>
                <th style={{ width: 45 }}>ลำดับ</th>
                <th>รายการแข่งขัน</th>
                <th style={{ width: 100 }}>ประเภท</th>
                <th style={{ width: 110 }}>ระดับชั้น</th>
                <th style={{ width: 170 }}>สถานที่ / ห้อง</th>
                <th style={{ width: 110 }}>จำนวนรับ</th>
              </tr>
            ) : (
              <tr>
                <th style={{ width: 45 }}>ลำดับ</th>
                <th>รายการแข่งขัน</th>
                <th style={{ width: 100 }}>ประเภท</th>
                <th style={{ width: 110 }}>จำนวนรับ</th>
                <th style={{ width: 100 }}>สมัครแล้ว</th>
                <th className="num" style={{ width: 110 }}>นักเรียน (คน)</th>
              </tr>
            )}
          </thead>
          <tbody>
            {groups.map((g) => (
              <SummaryGroupRows key={g.groupName} group={g} docType={docType} />
            ))}
            {docType === "regcount" && (
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={4}>รวมทั้งหมด {bundles.length} รายการ</td>
                <td>{bundles.reduce((s, b) => s + b.rosterCount, 0)} รายการสมัคร</td>
                <td className="num">{totalStudents}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryGroupRows({
  group,
  docType,
}: {
  group: { groupName: string; items: ReportBundle[] };
  docType: "summary" | "regcount";
}) {
  const label = group.groupName === "-" ? "ไม่ระบุหมวด" : group.groupName;
  return (
    <>
      <tr className="report-group-row">
        <td colSpan={6}>
          {label} ({group.items.length} รายการ)
        </td>
      </tr>
      {group.items.map((b, i) =>
        docType === "summary" ? (
          <tr key={b.id}>
            <td>{i + 1}</td>
            <td>
              {b.meta.competitionName}
              {(b.meta.eventDate || b.meta.startTime) && (
                <div className="text-xs muted">
                  {formatThaiDate(b.meta.eventDate)}
                  {b.meta.startTime ? ` ${hhmm(b.meta.startTime)}–${hhmm(b.meta.endTime)} น.` : ""}
                </div>
              )}
            </td>
            <td>{typeLabel(b)}</td>
            <td>{formatLevels(b.levels) || "-"}</td>
            <td>{b.venueName || "-"}</td>
            <td>{capacityLabel(b)}</td>
          </tr>
        ) : (
          <tr key={b.id}>
            <td>{i + 1}</td>
            <td>{b.meta.competitionName}</td>
            <td>{typeLabel(b)}</td>
            <td>{capacityLabel(b)}</td>
            <td>{b.meta.type === "team" ? `${b.rosterCount} ทีม` : `${b.rosterCount} คน`}</td>
            <td className="num">{b.studentCount}</td>
          </tr>
        )
      )}
      {docType === "regcount" && (
        <tr style={{ fontWeight: 600 }}>
          <td colSpan={4} style={{ textAlign: "right" }}>รวม{label !== "ไม่ระบุหมวด" ? `หมวด${label}` : ""}</td>
          <td>{group.items.reduce((s, b) => s + b.rosterCount, 0)} รายการสมัคร</td>
          <td className="num">{group.items.reduce((s, b) => s + b.studentCount, 0)}</td>
        </tr>
      )}
    </>
  );
}

export function ReportSheet({ bundle, docType, eventName }: { bundle: ReportBundle; docType: DocType; eventName: string }) {
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
