import type { ReactNode } from "react";

/**
 * ===== ชิ้นส่วนหน้าตาของ "เอกสารกระดาษ" ที่ใช้ร่วมกันทุกใบ =====
 *
 * เอกสารรายรายการมีสองทาง: หน้าเอกสาร/รายงานของรายการเดียว (CompetitionSheet)
 * กับหน้าออกรายงานรวมของ admin (ReportSheets) — ตารางและหัวกระดาษต้อง "เหมือนกันเป๊ะ"
 * เพราะมันคือเอกสารใบเดียวกันที่พิมพ์คนละทาง จึงเก็บไว้ที่นี่ที่เดียว
 *
 * ⚠ ห้ามคัดลอกโครงตารางไปเขียนซ้ำในไฟล์ใดไฟล์หนึ่ง เดี๋ยวมันจะหลุดจากกัน
 * แล้วเอกสารใบเดียวกันจะหน้าตาไม่เหมือนกันตามทางที่พิมพ์ออกมา
 */

export const SCHOOL_NAME = "โรงเรียนสุคนธีรวิทย์";

export type SheetMember = {
  studentCode: string;
  name: string;
  classLevel: string;
  classRoom: string;
  /** เลขที่ในห้อง — "" ได้ (สมัครก่อนระบบเก็บเลขที่ / SchoolOS ไม่ได้ส่งมา) */
  classNumber: string;
};

export type SheetEntry = {
  entryId: number;
  teamName: string | null;
  members: SheetMember[];
};

/** "ม.1/1" — รวมชั้นกับห้องเป็นช่องเดียวตามที่ใช้จริงบนเอกสารของโรงเรียน */
export function classLabel(m: SheetMember): string {
  const s = [m.classLevel, m.classRoom].filter(Boolean).join("/");
  return s || "-";
}

/**
 * หัวกระดาษ 4 บรรทัด: ประเภทเอกสาร → ชื่องาน + ชื่อโรงเรียน → ชื่อรายการ → วัน–เวลา
 * เรียงจาก "นี่คือเอกสารอะไร" ลงมาหา "ของรายการไหน เมื่อไร" ให้คนหยิบกระดาษขึ้นมาแล้วรู้ทันที
 */
export function SheetHeader({
  docLabel,
  eventName,
  competitionName,
  groupName,
  timeStr,
  note,
  compact = false,
}: {
  docLabel: string;
  /** ชื่องานจากหน้าตั้งค่า — "" ได้ ถ้ารายการยังไม่ผูกกับงานใด */
  eventName: string;
  /** เอกสารสรุปทั้งงานไม่มีรายการเดียว → เว้นว่างเพื่อข้ามบรรทัดนี้ */
  competitionName?: string;
  groupName?: string;
  /** วัน–เวลาแข่ง — "" ได้ ถ้ายังไม่กำหนด */
  timeStr?: string;
  /** บรรทัดท้ายเพิ่มเติม เช่น จำนวนรายการ/ผู้สมัคร ของเอกสารสรุป */
  note?: ReactNode;
  /** ย่อหัวกระดาษให้ทุกบรรทัดขนาดเท่ากัน — ใบรายการให้นักเรียนที่ยาวหลายหน้า ไม่ควรเสียที่ให้หัวเรื่อง */
  compact?: boolean;
}) {
  return (
    <div className={`print-title sheet-head${compact ? " sheet-head-compact" : ""}`}>
      <h2 className="sheet-head-doc">{docLabel}</h2>
      <div className="sheet-head-event">{[eventName, SCHOOL_NAME].filter(Boolean).join(" ")}</div>
      {competitionName && (
        <div>
          รายการ: {competitionName}
          {groupName && groupName !== "-" ? ` (${groupName})` : ""}
        </div>
      )}
      {timeStr && <div className="text-sm">{timeStr}</div>}
      {note && <div className="text-sm">{note}</div>}
    </div>
  );
}

/**
 * หัวคอลัมน์ส่วน "ตัวคน" ที่ทุกใบใช้เหมือนกัน: ลำดับ / ชื่อทีม / ชื่อ-สกุล / ชั้น / เลขที่
 * ใบไหนมีคอลัมน์ต่อท้าย (เกณฑ์คะแนน, เหรียญ) ให้เขียนต่อจากนี้ในตารางของใบนั้น
 */
export function PersonHeadCells({
  isTeam,
  leadLabel = "ลำดับ",
  signColumn = false,
}: {
  isTeam: boolean;
  leadLabel?: string;
  /**
   * ช่องว่างให้นักเรียนเซ็นชื่อตอนมารายงานตัว — ใบรายชื่อเท่านั้น
   * ⚠ ช่องนี้ต้องอยู่ท้ายสุดของตาราง จึงใช้ได้เฉพาะใบที่ไม่มีคอลัมน์ต่อท้าย (ไม่ใช่ใบกรอกคะแนน/ประกาศผล)
   */
  signColumn?: boolean;
}) {
  return (
    <>
      <th className="col-seq">{leadLabel}</th>
      {isTeam && <th className="col-team">ชื่อทีม</th>}
      <th className="col-name">ชื่อ-สกุล</th>
      <th className="col-class">ชั้น</th>
      <th className="col-seq">เลขที่</th>
      {signColumn && <th className="col-sign">ลงชื่อ</th>}
    </>
  );
}

/** จำนวนคอลัมน์ที่ PersonHeadCells กินไป — เอาไว้คิด colSpan ของแถว "ยังไม่มีข้อมูล" */
export function personColCount(isTeam: boolean, signColumn = false): number {
  return (isTeam ? 5 : 4) + (signColumn ? 1 : 0);
}

/**
 * แถวข้อมูลของตาราง: หนึ่งแถวต่อ "หนึ่งคน" เพื่อให้ชั้นกับเลขที่อยู่คนละช่องได้จริง
 * ช่องที่เป็นของทั้งทีม (ลำดับ, ชื่อทีม, คะแนน) ใช้ rowSpan คร่อมสมาชิกทุกคน
 * — เหมือนแบบฟอร์มที่โรงเรียนใช้อยู่ ไม่ใช่ยัดสมาชิกทุกคนลงช่องเดียวคั่นด้วยจุลภาค
 */
export function SheetEntryRows<T extends SheetEntry>({
  entries,
  isTeam,
  leadCell,
  trailingCells,
  rowHeight,
  signColumn = false,
}: {
  entries: T[];
  isTeam: boolean;
  /** ค่าในช่องแรก (ลำดับ หรือ อันดับ) — คร่อมทุกแถวของ entry นี้ */
  leadCell: (entry: T, index: number) => ReactNode;
  /**
   * <td> ที่ต่อท้ายชุดคอลัมน์ตัวคน (เกณฑ์คะแนน/รวม/เหรียญ)
   * ⚠ ต้องใส่ rowSpan ที่ส่งให้ทุกช่อง ไม่งั้นตารางจะเบี้ยวเมื่อทีมมีสมาชิกหลายคน
   */
  trailingCells?: (entry: T, index: number, rowSpan: number) => ReactNode;
  /** ความสูงขั้นต่ำต่อแถว — ใบกรอกคะแนนต้องมีที่ให้กรรมการเขียน */
  rowHeight?: number;
  /**
   * ช่องเซ็นชื่อท้ายแถว (คู่กับ signColumn ของ PersonHeadCells)
   * เว้นว่างคนละช่อง "ต่อหนึ่งคน" ไม่ใช่ต่อทีม — ทุกคนในทีมต้องเซ็นเองตอนมารายงานตัว
   */
  signColumn?: boolean;
}) {
  return (
    <>
      {entries.map((e, ei) => {
        // entry ที่ไม่มีสมาชิก (ข้อมูลพัง) ยังต้องมีแถวของตัวเอง ไม่งั้นลำดับจะข้ามหายไปเงียบ ๆ
        const members: (SheetMember | null)[] = e.members.length ? e.members : [null];
        return members.map((m, mi) => (
          <tr key={`${e.entryId}-${m?.studentCode ?? mi}`} style={rowHeight ? { height: rowHeight } : undefined}>
            {mi === 0 && (
              <td className="col-seq" rowSpan={members.length}>
                {leadCell(e, ei)}
              </td>
            )}
            {isTeam && mi === 0 && (
              <td className="col-team" rowSpan={members.length}>
                {e.teamName || `ทีม ${ei + 1}`}
              </td>
            )}
            <td className="col-name">{m?.name ?? "-"}</td>
            <td className="col-class">{m ? classLabel(m) : "-"}</td>
            <td className="col-seq">{m?.classNumber || "-"}</td>
            {signColumn && <td className="col-sign"></td>}
            {mi === 0 && trailingCells?.(e, ei, members.length)}
          </tr>
        ));
      })}
    </>
  );
}

/** ช่องลงชื่อท้ายเอกสาร */
export function SignatureBlock({ role }: { role: string }) {
  return (
    <div className="sheet-signature">
      <div>ลงชื่อ ......................................................... {role}</div>
      <div style={{ marginTop: 8 }}>( ......................................................... )</div>
    </div>
  );
}
