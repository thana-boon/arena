import { formatThaiDate, formatLevels, hhmm, isUnlimited } from "@/lib/domain";
import type { ReportBundle } from "@/lib/reportBundle";

export type DocType = "roster" | "scoresheet" | "announce" | "summary" | "regcount" | "venues" | "catalog";
export const DOC_LABEL: Record<DocType, string> = {
  roster: "ใบรายชื่อ",
  scoresheet: "ใบกรอกคะแนน",
  announce: "ใบประกาศผล",
  summary: "สรุปรายการแข่งขัน",
  regcount: "สรุปยอดผู้สมัคร",
  venues: "สรุปการใช้ห้อง",
  catalog: "รายละเอียดงานแข่งขัน",
};
/** คำอธิบายสั้น ๆ ใต้ชื่อเอกสารในหน้าออกรายงาน — กันเลือกผิดประเภท */
export const DOC_HINT: Record<DocType, string> = {
  roster: "รายชื่อผู้สมัครของแต่ละรายการ",
  scoresheet: "ตารางเปล่าให้กรรมการกรอกคะแนน",
  announce: "ผลการแข่งขัน อันดับ และเหรียญ",
  summary: "ตารางรวมทุกรายการ ประเภท ห้อง จำนวนรับ",
  regcount: "ยอดผู้สมัครรายรายการและรวมทั้งงาน",
  venues: "รายการแข่งขันแยกตามห้อง/สถานที่",
  catalog: "ชื่อรายการ ระดับชั้น รายละเอียด — เอาไว้แจกนักเรียน",
};
/** จัดกลุ่มปุ่มเลือกเอกสารในหน้าออกรายงาน ให้เห็นชัดว่าอันไหนพิมพ์ทีละรายการ อันไหนเป็นตารางรวม */
export const DOC_SECTIONS: { title: string; docs: DocType[] }[] = [
  { title: "เอกสารรายรายการ — แต่ละรายการขึ้นหน้าใหม่", docs: ["roster", "scoresheet", "announce"] },
  { title: "เอกสารสรุปทั้งงาน — ตารางรวมฉบับเดียว", docs: ["summary", "regcount", "venues", "catalog"] },
];
/** เอกสารสรุป = ตารางรวมฉบับเดียวทั้งงาน (ไม่แยกหน้าใหม่ต่อรายการ) — แสดงตัวอย่างบนจอได้เลย */
export const SUMMARY_DOCS: DocType[] = ["summary", "regcount", "venues", "catalog"];

/** ป้ายประเภท เช่น "เดี่ยว" / "ทีม 2–5 คน" — รายการที่ไม่มีการแข่งขันบอกไว้ให้ชัด */
function typeLabel(b: ReportBundle): string {
  if (b.noContest) return b.meta.type === "team" ? "ทีม (ไม่มีการแข่งขัน)" : "ไม่มีการแข่งขัน";
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
                <th className="col-fit" style={{ width: 45 }}>ลำดับ</th>
                <th>รายการแข่งขัน</th>
                <th className="col-fit" style={{ width: 100 }}>ประเภท</th>
                <th className="col-fit" style={{ width: 110 }}>ระดับชั้น</th>
                <th className="col-venue" style={{ width: 170 }}>สถานที่ / ห้อง</th>
                <th className="col-fit" style={{ width: 110 }}>จำนวนรับ</th>
              </tr>
            ) : (
              <tr>
                <th className="col-fit" style={{ width: 45 }}>ลำดับ</th>
                <th>รายการแข่งขัน</th>
                <th className="col-fit" style={{ width: 100 }}>ประเภท</th>
                <th className="col-fit" style={{ width: 110 }}>จำนวนรับ</th>
                <th className="col-fit" style={{ width: 100 }}>สมัครแล้ว</th>
                <th className="num col-fit" style={{ width: 110 }}>นักเรียน (คน)</th>
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
            <td className="col-fit">{i + 1}</td>
            <td>
              {b.meta.competitionName}
              {(b.meta.eventDate || b.meta.startTime) && (
                <div className="text-xs muted">
                  {formatThaiDate(b.meta.eventDate)}
                  {b.meta.startTime ? ` ${hhmm(b.meta.startTime)}–${hhmm(b.meta.endTime)} น.` : ""}
                </div>
              )}
            </td>
            <td className="col-fit">{typeLabel(b)}</td>
            <td className="col-fit">{formatLevels(b.levels) || "-"}</td>
            <td className="col-venue">{b.venueName || "-"}</td>
            <td className="col-fit">{capacityLabel(b)}</td>
          </tr>
        ) : (
          <tr key={b.id}>
            <td className="col-fit">{i + 1}</td>
            <td>{b.meta.competitionName}</td>
            <td className="col-fit">{typeLabel(b)}</td>
            <td className="col-fit">{capacityLabel(b)}</td>
            <td className="col-fit">{b.meta.type === "team" ? `${b.rosterCount} ทีม` : `${b.rosterCount} คน`}</td>
            <td className="num col-fit">{b.studentCount}</td>
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

/** จัดกลุ่มรายการตามห้อง — รายการที่ใช้หลายห้องปรากฏใต้ทุกห้องที่ใช้, ไม่ระบุห้องไปกลุ่มท้ายสุด */
function groupByVenue(bundles: ReportBundle[]): { venueName: string; items: ReportBundle[] }[] {
  const map = new Map<string, ReportBundle[]>();
  const noVenue: ReportBundle[] = [];
  for (const b of bundles) {
    if (!b.venueList.length) {
      noVenue.push(b);
      continue;
    }
    for (const v of b.venueList) {
      const list = map.get(v);
      if (list) list.push(b);
      else map.set(v, [b]);
    }
  }
  const out = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "th"))
    .map(([venueName, items]) => ({ venueName, items }));
  if (noVenue.length) out.push({ venueName: "", items: noVenue });
  return out;
}

/** เอกสารสรุปการใช้ห้อง: จัดกลุ่มตามห้อง/สถานที่ ว่าใช้แข่งรายการอะไร ระดับชั้นไหน วัน–เวลาใด */
export function VenueUsageSheet({
  bundles,
  eventName,
  yearBe,
}: {
  bundles: ReportBundle[];
  eventName: string;
  yearBe: number;
}) {
  const groups = groupByVenue(bundles);
  const venueCount = groups.filter((g) => g.venueName).length;

  return (
    <section className="report-section report-web" style={{ breakBefore: "auto" }}>
      <div className="print-title" style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>โรงเรียนสุคนธีรวิทย์</div>
        <div>{eventName}</div>
        <h2 style={{ margin: "8px 0 4px" }}>{DOC_LABEL.venues}</h2>
        <div className="text-sm">
          ปีการศึกษา {yearBe} · ใช้ {venueCount} ห้อง · {bundles.length} รายการ
        </div>
      </div>

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="table">
          <thead>
            <tr>
              <th className="col-fit" style={{ width: 45 }}>ลำดับ</th>
              <th>รายการแข่งขัน</th>
              <th className="col-fit" style={{ width: 140 }}>หมวด</th>
              <th className="col-fit" style={{ width: 110 }}>ระดับชั้น</th>
              <th className="col-fit" style={{ width: 160 }}>วัน–เวลา</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <VenueGroupRows key={g.venueName || "-"} group={g} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VenueGroupRows({ group }: { group: { venueName: string; items: ReportBundle[] } }) {
  const label = group.venueName || "ไม่ระบุห้อง";
  return (
    <>
      <tr className="report-group-row">
        <td colSpan={5}>
          {label} ({group.items.length} รายการ)
        </td>
      </tr>
      {group.items.map((b, i) => (
        <tr key={b.id}>
          <td className="col-fit">{i + 1}</td>
          <td>{b.meta.competitionName}</td>
          <td className="col-fit">{b.groupName === "-" ? "ไม่ระบุหมวด" : b.groupName}</td>
          <td className="col-fit">{formatLevels(b.levels) || "-"}</td>
          <td className="col-fit">
            {b.meta.eventDate || b.meta.startTime ? (
              <>
                {formatThaiDate(b.meta.eventDate)}
                {b.meta.startTime ? ` ${hhmm(b.meta.startTime)}–${hhmm(b.meta.endTime)} น.` : ""}
              </>
            ) : (
              "-"
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * ใบรายการให้นักเรียน: ชื่อรายการ + ระดับชั้น + รายละเอียด เท่านั้น (ไม่มีคะแนน/ห้อง/ยอดสมัคร)
 * splitByGroup = ขึ้นหน้าใหม่ทีละหมวด เอาไว้แจกแยกกลุ่มสาระ
 */
export function CatalogSheet({
  bundles,
  eventName,
  yearBe,
  splitByGroup = false,
  levelFilter = [],
}: {
  bundles: ReportBundle[];
  eventName: string;
  yearBe: number;
  splitByGroup?: boolean;
  levelFilter?: string[];
}) {
  const groups = groupBySubject(bundles);
  const levelNote = levelFilter.length ? `เฉพาะ ${formatLevels(levelFilter)}` : "";

  if (splitByGroup) {
    return (
      <>
        {groups.map((g) => (
          <CatalogPage
            key={g.groupName}
            groups={[g]}
            eventName={eventName}
            yearBe={yearBe}
            levelNote={levelNote}
            showGroupRows={false}
            pageBreak
          />
        ))}
      </>
    );
  }
  return (
    <CatalogPage
      groups={groups}
      eventName={eventName}
      yearBe={yearBe}
      levelNote={levelNote}
      showGroupRows={groups.length > 1}
    />
  );
}

function CatalogPage({
  groups,
  eventName,
  yearBe,
  levelNote,
  showGroupRows,
  pageBreak = false,
}: {
  groups: { groupName: string; items: ReportBundle[] }[];
  eventName: string;
  yearBe: number;
  levelNote: string;
  showGroupRows: boolean;
  pageBreak?: boolean;
}) {
  const count = groups.reduce((s, g) => s + g.items.length, 0);
  // แบบแยกหมวด: ชื่อหมวดขึ้นไปอยู่หัวเอกสารแทนแถวคั่นในตาราง
  const soleGroup = groups.length === 1 && !showGroupRows ? groups[0].groupName : "";

  return (
    <section className="report-section report-web report-catalog" style={pageBreak ? undefined : { breakBefore: "auto" }}>
      {/* หัวเอกสารแบบกระชับ: ตัวอักษรขนาดเดียวกันทั้งหมด 2 บรรทัด ไม่กินพื้นที่กระดาษ */}
      <div className="print-title report-catalog-head" style={{ marginBottom: 8, textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>
          {DOC_LABEL.catalog} · {eventName}
          {soleGroup ? ` · ${soleGroup === "-" ? "ไม่ระบุหมวด" : soleGroup}` : ""}
        </div>
        <div>
          โรงเรียนสุคนธีรวิทย์ · ปีการศึกษา {yearBe} · {count} รายการ
          {levelNote ? ` · ${levelNote}` : ""}
        </div>
      </div>

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="table">
          <thead>
            <tr>
              <th className="col-fit" style={{ width: 45 }}>ลำดับ</th>
              <th style={{ width: "30%" }}>รายการแข่งขัน</th>
              <th className="col-fit" style={{ width: 110 }}>ระดับชั้น</th>
              <th>รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <CatalogGroupRows key={g.groupName} group={g} showGroupRow={showGroupRows} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CatalogGroupRows({
  group,
  showGroupRow,
}: {
  group: { groupName: string; items: ReportBundle[] };
  showGroupRow: boolean;
}) {
  const label = group.groupName === "-" ? "ไม่ระบุหมวด" : group.groupName;
  return (
    <>
      {showGroupRow && (
        <tr className="report-group-row">
          <td colSpan={4}>
            {label} ({group.items.length} รายการ)
          </td>
        </tr>
      )}
      {group.items.map((b, i) => (
        <tr key={b.id}>
          <td className="col-fit">{i + 1}</td>
          <td>{b.meta.competitionName}</td>
          <td className="col-fit">{formatLevels(b.levels) || "-"}</td>
          {/* รายละเอียดเก็บเป็นข้อความหลายบรรทัด — คงย่อหน้าเดิมไว้ */}
          <td style={{ whiteSpace: "pre-wrap" }}>{b.description?.trim() || "-"}</td>
        </tr>
      ))}
    </>
  );
}

export function ReportSheet({ bundle, docType, eventName }: { bundle: ReportBundle; docType: DocType; eventName: string }) {
  const { meta, criteria, fullScore, roster, results, noContest } = bundle;
  const timeStr = meta.eventDate
    ? `${formatThaiDate(meta.eventDate)}${meta.startTime ? ` เวลา ${meta.startTime.slice(0, 5)}–${meta.endTime?.slice(0, 5)} น.` : ""}`
    : "";
  // รายการที่ไม่มีการแข่งขันไม่มีคะแนน/อันดับ — ใบกรอกคะแนนและใบประกาศผลจึงไม่มีความหมาย
  const scoreDoc = docType === "scoresheet" || docType === "announce";

  return (
    <section className="report-section">
      <div className="print-title" style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>โรงเรียนสุคนธีรวิทย์</div>
        <div>{eventName}</div>
        <h2 style={{ margin: "8px 0 4px" }}>{DOC_LABEL[docType]}</h2>
        <div>รายการ: {meta.competitionName}{meta.groupName ? ` (${meta.groupName})` : ""}</div>
        {timeStr && <div className="text-sm">{timeStr}</div>}
      </div>

      {noContest && scoreDoc && (
        <p style={{ textAlign: "center", marginTop: 32 }}>
          รายการนี้ไม่มีการแข่งขัน — ไม่มีการให้คะแนน อันดับ หรือรางวัล (ใช้ “ใบรายชื่อ” แทน)
        </p>
      )}

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

      {docType === "scoresheet" && !noContest && (
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

      {docType === "announce" && !noContest && (
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
