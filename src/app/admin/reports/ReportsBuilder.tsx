"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type { ReportBundle } from "@/lib/reportBundle";
import { formatThaiDate } from "@/lib/domain";

type DocType = "roster" | "scoresheet" | "announce";

const DOC_LABEL: Record<DocType, string> = {
  roster: "ใบรายชื่อ",
  scoresheet: "ใบกรอกคะแนน",
  announce: "ใบประกาศผล",
};

export function ReportsBuilder({ yearBe, bundles }: { yearBe: number; bundles: ReportBundle[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [docType, setDocType] = useState<DocType>("roster");
  // สร้างเอกสารพิมพ์เฉพาะตอนกดพิมพ์ — ไม่พรีวิวทันทีตอนติ๊ก (50-70 รายการจะหนักจนค้าง)
  const [printing, setPrinting] = useState(false);

  // จัดกลุ่มตามหมวด (bundles เรียงตามหมวด→ชื่อมาแล้ว)
  const groups = useMemo(() => {
    const map = new Map<number, { id: number; name: string; items: ReportBundle[] }>();
    for (const b of bundles) {
      const g = map.get(b.subjectGroupId) ?? { id: b.subjectGroupId, name: b.groupName, items: [] };
      g.items.push(b);
      map.set(b.subjectGroupId, g);
    }
    return [...map.values()];
  }, [bundles]);

  const allIds = useMemo(() => bundles.map((b) => b.id), [bundles]);
  const selectedBundles = bundles.filter((b) => selected.has(b.id));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function setMany(ids: number[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) (on ? next.add(id) : next.delete(id));
      return next;
    });
  }
  const allOn = allIds.length > 0 && allIds.every((id) => selected.has(id));

  // เมื่อกดพิมพ์: mount เอกสารก่อน แล้วค่อยเรียก window.print() ในเฟรมถัดไป
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

  if (!bundles.length) {
    return (
      <div className="stack">
        <div className="page-header"><h1>ออกรายงาน</h1></div>
        <div className="alert alert-warning">ยังไม่มีรายการแข่งขันในปีที่เปิดใช้งาน</div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="no-print row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>ออกรายงาน</h1>
          <div className="subtitle">เลือกหมวด/รายการ แล้วพิมพ์เอกสารรวมชุดเดียว · ปีการศึกษา {yearBe}</div>
        </div>
        <button
          className="btn btn-primary"
          disabled={!selectedBundles.length || printing}
          onClick={() => setPrinting(true)}
        >
          <Icon name="printer" size={18} /> {printing ? "กำลังเตรียมเอกสาร…" : `พิมพ์ (${selectedBundles.length})`}
        </button>
      </div>

      {/* ตัวเลือกประเภทเอกสาร */}
      <div className="no-print card">
        <label className="form-label">ประเภทเอกสาร</label>
        <div className="auth-tabs" style={{ maxWidth: 520 }}>
          {(Object.keys(DOC_LABEL) as DocType[]).map((t) => (
            <button key={t} className={`auth-tab${docType === t ? " active" : ""}`} onClick={() => setDocType(t)}>
              {DOC_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ตัวเลือกหมวด/รายการ */}
      <div className="no-print card">
        <div className="row between mb-4">
          <label className="form-check">
            <input type="checkbox" checked={allOn} onChange={(e) => setMany(allIds, e.target.checked)} />
            <span style={{ fontWeight: 600 }}>เลือกทั้งหมด ({allIds.length} รายการ)</span>
          </label>
          <button className="btn btn-ghost btn-sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>
            ล้างการเลือก
          </button>
        </div>

        {groups.map((g) => {
          const ids = g.items.map((b) => b.id);
          const groupOn = ids.every((id) => selected.has(id));
          const someOn = !groupOn && ids.some((id) => selected.has(id));
          return (
            <div key={g.id} className="report-select-group">
              <label className="report-select-head">
                <input
                  type="checkbox"
                  checked={groupOn}
                  ref={(el) => { if (el) el.indeterminate = someOn; }}
                  onChange={(e) => setMany(ids, e.target.checked)}
                />
                <span><Icon name="book" size={16} /> {g.name}</span>
                <span className="muted text-sm" style={{ fontWeight: 400 }}>({g.items.length} รายการ)</span>
              </label>
              {g.items.map((b) => (
                <label key={b.id} className="report-select-item">
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} />
                  <span style={{ flex: 1 }}>{b.meta.competitionName}</span>
                  <span className="badge">{b.meta.type === "team" ? "ทีม" : "เดี่ยว"}</span>
                  <span className="muted text-sm nowrap">{b.rosterCount} ผู้เข้าแข่ง</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>

      {/* สรุปรายการที่เลือก (ไม่เรนเดอร์เอกสารเต็มเพื่อไม่ให้หน้าหนัก) */}
      {!selectedBundles.length ? (
        <div className="no-print empty-state card">
          <Icon name="printer" size={44} className="empty-ico" />
          <p>ยังไม่ได้เลือกรายการ — ติ๊กหมวดหรือรายการด้านบนเพื่อเตรียมพิมพ์</p>
        </div>
      ) : (
        <div className="no-print card">
          <div className="alert alert-info">
            เลือกไว้ {selectedBundles.length} รายการ · เอกสาร{DOC_LABEL[docType]} — กด “พิมพ์” เพื่อสร้างเอกสาร
            (แต่ละรายการขึ้นหน้าใหม่ตอนพิมพ์)
          </div>
          <ul className="report-summary-list">
            {selectedBundles.map((b) => (
              <li key={b.id}>
                <span className="muted text-sm">{b.groupName}</span>
                <span style={{ flex: 1 }}>{b.meta.competitionName}</span>
                <span className="muted text-sm nowrap">{b.rosterCount} ผู้เข้าแข่ง</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* เอกสารสำหรับพิมพ์ — mount เฉพาะตอนกดพิมพ์ แล้วซ่อนบนจอ (แสดงเฉพาะตอนพิมพ์) */}
      {printing && (
        <div className="print-only">
          {selectedBundles.map((b) => (
            <ReportSheet key={b.id} bundle={b} docType={docType} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportSheet({ bundle, docType }: { bundle: ReportBundle; docType: DocType }) {
  const { meta, criteria, fullScore, roster, results } = bundle;
  const timeStr = meta.eventDate
    ? `${formatThaiDate(meta.eventDate)}${meta.startTime ? ` เวลา ${meta.startTime.slice(0, 5)}–${meta.endTime?.slice(0, 5)} น.` : ""}`
    : "";

  return (
    <section className="report-section">
      <div className="print-title" style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-th-serif)", fontSize: 16, fontWeight: 700 }}>โรงเรียนสุคนธีรวิทย์</div>
        <div style={{ fontSize: 16 }}>งานแข่งขันทางวิชาการ ปีการศึกษา {meta.yearBe}</div>
        <h2 style={{ margin: "8px 0 4px", fontSize: 16 }}>{DOC_LABEL[docType]}</h2>
        <div>รายการ: {meta.competitionName} ({meta.groupName})</div>
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
