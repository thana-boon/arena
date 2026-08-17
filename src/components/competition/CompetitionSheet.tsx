import { formatThaiDate } from "@/lib/domain";
import {
  PersonHeadCells,
  SheetEntryRows,
  SheetHeader,
  SignatureBlock,
  personColCount,
  type SheetEntry,
  type SheetMember,
} from "@/components/report/sheetLayout";

/** ชนิดเอกสารของรายการแข่งขัน — ใช้ทั้งแท็บพรีวิวและหน้าพิมพ์ (?doc=) */
export type CompDocType = "roster" | "scoresheet" | "announce";

export const COMP_DOC_LABEL: Record<CompDocType, string> = {
  roster: "ใบรายชื่อผู้เข้าแข่งขัน",
  scoresheet: "ใบกรอกคะแนน",
  announce: "ใบประกาศผลการแข่งขัน",
};

export const COMP_DOC_TABS: { key: CompDocType; label: string }[] = [
  { key: "roster", label: "ใบรายชื่อ" },
  { key: "scoresheet", label: "ใบกรอกคะแนน" },
  { key: "announce", label: "ใบประกาศผล" },
];

export function isCompDocType(v: unknown): v is CompDocType {
  return v === "roster" || v === "scoresheet" || v === "announce";
}

export type SheetMeta = {
  competitionName: string;
  groupName: string;
  type: "individual" | "team";
  yearBe: number;
  /** ชื่องานที่ตั้งไว้ในหน้าตั้งค่า — "" ถ้ารายการยังไม่ผูกกับงานใด */
  eventName: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
};
export type SheetCrit = { id: number; name: string; max: number };
export type SheetResultRow = {
  entryId: number;
  teamName: string | null;
  members: SheetMember[];
  scoresByCriterion: Record<number, number>;
  total: number;
  percent: number;
  rank: number;
  medalLabel: string;
};

export type SheetData = {
  meta: SheetMeta;
  criteria: SheetCrit[];
  fullScore: number;
  roster: SheetEntry[];
  results: SheetResultRow[];
};

/**
 * เนื้อเอกสารหนึ่งใบ (หัวกระดาษ + ตาราง + ช่องลงชื่อ)
 * ใช้ร่วมกันระหว่างพรีวิวในหน้าเอกสาร และหน้าพิมพ์ที่เปิดในแท็บใหม่ เพื่อให้เห็นตรงกับที่พิมพ์ออกมา
 */
export function CompetitionSheet({
  doc,
  meta,
  criteria,
  fullScore,
  roster,
  results,
}: SheetData & { doc: CompDocType }) {
  const timeStr = meta.eventDate
    ? `${formatThaiDate(meta.eventDate)}${meta.startTime ? ` เวลา ${meta.startTime.slice(0, 5)}–${meta.endTime?.slice(0, 5)} น.` : ""}`
    : "";
  const isTeam = meta.type === "team";
  const personCols = personColCount(isTeam);
  const personColsSign = personColCount(isTeam, true);

  return (
    <>
      <SheetHeader
        docLabel={COMP_DOC_LABEL[doc]}
        eventName={meta.eventName || `ปีการศึกษา ${meta.yearBe}`}
        competitionName={meta.competitionName}
        groupName={meta.groupName}
        timeStr={timeStr}
      />

      {/* ===== 1. ใบรายชื่อ (มีช่องเซ็นชื่อท้ายแถว ใช้เป็นใบรายงานตัวได้) ===== */}
      {doc === "roster" && (
        <table className="table sheet-table">
          <thead>
            <tr>
              <PersonHeadCells isTeam={isTeam} signColumn />
            </tr>
          </thead>
          <tbody>
            <SheetEntryRows entries={roster} isTeam={isTeam} leadCell={(_e, i) => i + 1} signColumn />
            {!roster.length && <tr><td colSpan={personColsSign} className="text-center muted">ยังไม่มีผู้ลงทะเบียน</td></tr>}
          </tbody>
        </table>
      )}

      {/* ===== 2. ใบกรอกคะแนน ===== */}
      {doc === "scoresheet" && (
        <>
          <table className="table sheet-table">
            <thead>
              <tr>
                <PersonHeadCells isTeam={isTeam} />
                {criteria.map((c) => <th key={c.id} className="num">{c.name}<div className="text-xs">({c.max})</div></th>)}
                <th className="num">รวม ({fullScore})</th>
              </tr>
            </thead>
            <tbody>
              <SheetEntryRows
                entries={roster}
                isTeam={isTeam}
                leadCell={(_e, i) => i + 1}
                rowHeight={32}
                trailingCells={(_e, _i, rowSpan) => (
                  <>
                    {criteria.map((c) => <td key={c.id} className="num" rowSpan={rowSpan}></td>)}
                    <td className="num" rowSpan={rowSpan}></td>
                  </>
                )}
              />
              {!roster.length && <tr><td colSpan={personCols + criteria.length + 1} className="text-center muted">ยังไม่มีผู้ลงทะเบียน</td></tr>}
            </tbody>
          </table>
          <SignatureBlock role="กรรมการ" />
        </>
      )}

      {/* ===== 3. ใบประกาศผล ===== */}
      {doc === "announce" && (
        <>
          <table className="table sheet-table">
            <thead>
              <tr>
                <PersonHeadCells isTeam={isTeam} leadLabel="อันดับ" />
                {criteria.map((c) => <th key={c.id} className="num">{c.name}</th>)}
                <th className="num">รวม</th>
                <th className="col-medal">เหรียญ</th>
              </tr>
            </thead>
            <tbody>
              <SheetEntryRows
                entries={results}
                isTeam={isTeam}
                leadCell={(r) => <strong>{r.rank}</strong>}
                trailingCells={(r, _i, rowSpan) => (
                  <>
                    {criteria.map((c) => (
                      <td key={c.id} className="num" rowSpan={rowSpan}>{r.scoresByCriterion[c.id]?.toFixed(2) ?? "-"}</td>
                    ))}
                    <td className="num" rowSpan={rowSpan} style={{ fontWeight: 600 }}>{r.total.toFixed(2)}</td>
                    <td className="col-medal" rowSpan={rowSpan}>{r.medalLabel}</td>
                  </>
                )}
              />
              {!results.length && <tr><td colSpan={personCols + criteria.length + 2} className="text-center muted">ยังไม่มีผลการแข่งขัน</td></tr>}
            </tbody>
          </table>
          <SignatureBlock role="ประธานกรรมการ" />
        </>
      )}
    </>
  );
}
