"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { CLASS_LEVELS } from "@/lib/domain";
import type { ReportBundle } from "@/lib/reportBundle";
import {
  CatalogSheet,
  DOC_HINT,
  DOC_LABEL,
  DOC_SECTIONS,
  SUMMARY_DOCS,
  type DocType,
  SummarySheet,
  VenueUsageSheet,
} from "./ReportSheets";

// basePath (/arena) ไม่ถูกเติมให้ window.open อัตโนมัติ ต้อง prefix เอง
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** ลำดับระดับชั้นตาม CLASS_LEVELS (ชั้นที่ไม่รู้จักไปท้ายสุด) */
const levelIndex = (lv: string) => {
  const i = (CLASS_LEVELS as readonly string[]).indexOf(lv);
  return i === -1 ? 999 : i;
};

export function ReportsByEvent({
  yearBe,
  events,
  bundles,
  defaultEventId = null,
  scopeHint = null,
}: {
  yearBe: number;
  events: { id: number; name: string }[];
  bundles: ReportBundle[];
  /** "งานเริ่มต้น" จากหน้าตั้งค่า — ใช้เป็นงานที่เลือกไว้ให้ตอนเปิดหน้านี้ */
  defaultEventId?: number | null;
  /** ข้อความบอกขอบเขตที่มองเห็น (ฝั่งครูเห็นไม่ครบทุกรายการ ต้องบอกไว้ไม่งั้นนึกว่าข้อมูลหาย) */
  scopeHint?: string | null;
}) {
  const [eventId, setEventId] = useState<number | null>(
    (defaultEventId != null && events.some((e) => e.id === defaultEventId) ? defaultEventId : events[0]?.id) ?? null
  );
  const [docType, setDocType] = useState<DocType>("roster");
  // ตัวกรอง: เซ็ตว่าง = ไม่กรอง (เอาทั้งหมด)
  const [groupIds, setGroupIds] = useState<Set<number>>(new Set());
  const [levels, setLevels] = useState<Set<string>>(new Set());
  // ใบรายการให้นักเรียน: ขึ้นหน้าใหม่ทีละหมวด (เอาไว้แจกแยกกลุ่มสาระ)
  const [splitByGroup, setSplitByGroup] = useState(false);

  const eventName = events.find((e) => e.id === eventId)?.name ?? "";
  const inEvent = useMemo(() => bundles.filter((b) => b.eventId === eventId), [bundles, eventId]);

  // ตัวเลือกตัวกรอง — สร้างจากรายการในงานที่เลือกเท่านั้น (ไม่โชว์หมวด/ชั้นที่ไม่มีอยู่จริง)
  const groupOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const b of inEvent) seen.set(b.subjectGroupId ?? -1, b.groupName === "-" ? "ไม่ระบุหมวด" : b.groupName);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [inEvent]);

  const levelOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const b of inEvent) for (const lv of b.levels) seen.add(lv);
    return [...seen].sort((a, b) => levelIndex(a) - levelIndex(b));
  }, [inEvent]);

  // รายการที่จะพิมพ์จริง — ต้องผ่านทั้งตัวกรองหมวดและระดับชั้น
  // ระดับชั้น: รายการหนึ่งรับได้หลายชั้น → นับว่าเข้าเงื่อนไขถ้ามีชั้นใดชั้นหนึ่งที่เลือกไว้
  const selectedBundles = useMemo(
    () =>
      inEvent.filter(
        (b) =>
          (groupIds.size === 0 || groupIds.has(b.subjectGroupId ?? -1)) &&
          (levels.size === 0 || b.levels.some((lv) => levels.has(lv)))
      ),
    [inEvent, groupIds, levels]
  );
  const isSummaryDoc = SUMMARY_DOCS.includes(docType);
  const isFiltered = groupIds.size > 0 || levels.size > 0;

  function toggleGroup(id: number) {
    setGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleLevel(lv: string) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lv)) next.delete(lv);
      else next.add(lv);
      return next;
    });
  }
  function clearFilters() {
    setGroupIds(new Set());
    setLevels(new Set());
  }

  /** เปิดเอกสารในแท็บใหม่ แล้วแท็บนั้นเด้งหน้าต่างพิมพ์เอง — กันเผลอปิดแท็บงานหลัก */
  const openPrint = () => {
    if (!eventId) return;
    const sp = new URLSearchParams({ event: String(eventId), doc: docType });
    // ส่งตัวกรองไปหน้าพิมพ์ด้วย ไม่งั้นแท็บใหม่จะพิมพ์ทุกรายการในงาน
    if (groupIds.size) sp.set("groups", [...groupIds].join(","));
    if (levels.size) sp.set("levels", [...levels].join(","));
    if (docType === "catalog" && splitByGroup) sp.set("split", "group");
    window.open(`${BASE}/reports/print?${sp.toString()}`, "_blank", "noopener");
  };

  return (
    <div className="stack">
      <div className="no-print row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>ออกรายงาน</h1>
          <div className="subtitle">
            เลือกงาน แล้วพิมพ์เอกสารรวมทุกรายการในงานนั้น · ปีการศึกษา {yearBe}
            {scopeHint && ` · ${scopeHint}`}
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={!selectedBundles.length}
          onClick={openPrint}
        >
          <Icon name="printer" size={18} /> {isSummaryDoc ? "พิมพ์" : `พิมพ์ (${selectedBundles.length})`}
        </button>
      </div>

      <div className="no-print card stack">
        <label className="field">
          <span>งาน</span>
          <select
            value={eventId ?? ""}
            onChange={(e) => {
              setEventId(Number(e.target.value) || null);
              clearFilters(); // งานใหม่มีหมวด/ชั้นคนละชุด
            }}
          >
            {!events.length && <option value="">— ยังไม่มีงาน —</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>

        <div>
          <label className="form-label">ประเภทเอกสาร</label>
          {DOC_SECTIONS.map((sec) => (
            <div key={sec.title} className="doc-picker-section">
              <div className="doc-picker-title">{sec.title}</div>
              <div className="doc-picker">
                {sec.docs.map((t) => (
                  <button
                    key={t}
                    className={`doc-opt${docType === t ? " active" : ""}`}
                    aria-pressed={docType === t}
                    onClick={() => setDocType(t)}
                  >
                    <span className="doc-opt-name">{DOC_LABEL[t]}</span>
                    <span className="doc-opt-hint">{DOC_HINT[t]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {groupOptions.length > 0 && (
          <div>
            <label className="form-label">หมวดวิชา</label>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <button
                className={`btn btn-sm ${groupIds.size === 0 ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setGroupIds(new Set())}
              >
                ทุกหมวด
              </button>
              {groupOptions.map((g) => (
                <button
                  key={g.id}
                  className={`btn btn-sm ${groupIds.has(g.id) ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => toggleGroup(g.id)}
                >
                  {g.name} ({inEvent.filter((b) => (b.subjectGroupId ?? -1) === g.id).length})
                </button>
              ))}
            </div>
            <span className="form-hint">
              เลือกได้หลายหมวด — ใช้ร่วมกับระดับชั้นได้ เช่น หมวดวิทยาศาสตร์ เฉพาะ ม.4 กับ ม.5
            </span>
          </div>
        )}

        {levelOptions.length > 0 && (
          <div>
            <label className="form-label">ระดับชั้น</label>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <button
                className={`btn btn-sm ${levels.size === 0 ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setLevels(new Set())}
              >
                ทุกชั้น
              </button>
              {levelOptions.map((lv) => (
                <button
                  key={lv}
                  className={`btn btn-sm ${levels.has(lv) ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => toggleLevel(lv)}
                >
                  {lv}
                </button>
              ))}
            </div>
            <span className="form-hint">
              เลือกได้หลายชั้น — จะได้รายการที่เปิดรับชั้นที่เลือกไว้ (รายการที่รับหลายชั้นจะติดมาด้วยถ้าตรงชั้นใดชั้นหนึ่ง)
            </span>
          </div>
        )}

        {docType === "catalog" && groupOptions.length > 1 && (
          <label className="switch-row">
            <span className="switch">
              <input type="checkbox" checked={splitByGroup} onChange={(e) => setSplitByGroup(e.target.checked)} />
              <span className="knob" />
            </span>
            <span>
              <span className="switch-label">แยกหน้าตามหมวดวิชา</span>
              <span className="form-hint">
                แต่ละหมวดขึ้นหน้าใหม่พร้อมหัวเอกสารของตัวเอง — เอาไว้แจกแยกกลุ่มสาระ
              </span>
            </span>
          </label>
        )}

        <div className="alert alert-info">
          {!selectedBundles.length
            ? "ไม่มีรายการตามตัวกรองที่เลือก — ลองเอาตัวกรองบางตัวออก"
            : isSummaryDoc
              ? `เลือกไว้ ${selectedBundles.length} รายการ${isFiltered ? ` (จากทั้งหมด ${inEvent.length})` : ""} — ${
                  docType === "catalog" && splitByGroup
                    ? "เอกสารแยกเป็นชุดละหมวด"
                    : "เอกสารสรุปเป็นตารางรวมฉบับเดียว"
                } (กด "พิมพ์" เพื่อเปิดเอกสารในแท็บใหม่)`
              : `เลือกไว้ ${selectedBundles.length} รายการ${isFiltered ? ` (จากทั้งหมด ${inEvent.length})` : ""} — กด "พิมพ์" เพื่อเปิดเอกสารในแท็บใหม่ (แต่ละรายการขึ้นหน้าใหม่)`}
        </div>
      </div>

      {/* เอกสารสรุป: แสดงตัวอย่างบนจอ (ตัวจริงพิมพ์จากแท็บใหม่ /reports/print) */}
      {isSummaryDoc && selectedBundles.length > 0 && (
        <div className="card">
          {docType === "venues" ? (
            <VenueUsageSheet bundles={selectedBundles} eventName={eventName} yearBe={yearBe} />
          ) : docType === "catalog" ? (
            <CatalogSheet
              bundles={selectedBundles}
              eventName={eventName}
              yearBe={yearBe}
              splitByGroup={splitByGroup}
              levelFilter={[...levels]}
            />
          ) : (
            <SummarySheet bundles={selectedBundles} docType={docType as "summary" | "regcount"} eventName={eventName} yearBe={yearBe} />
          )}
        </div>
      )}
    </div>
  );
}
