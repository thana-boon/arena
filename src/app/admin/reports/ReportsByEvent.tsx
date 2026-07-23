"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type { ReportBundle } from "@/lib/reportBundle";
import { DOC_LABEL, SUMMARY_DOCS, type DocType, SummarySheet } from "./ReportSheets";

// basePath (/arena) ไม่ถูกเติมให้ window.open อัตโนมัติ ต้อง prefix เอง
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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

  const eventName = events.find((e) => e.id === eventId)?.name ?? "";
  const selectedBundles = useMemo(
    () => bundles.filter((b) => b.eventId === eventId),
    [bundles, eventId]
  );
  const isSummaryDoc = SUMMARY_DOCS.includes(docType);

  /** เปิดเอกสารในแท็บใหม่ แล้วแท็บนั้นเด้งหน้าต่างพิมพ์เอง — กันเผลอปิดแท็บงานหลัก */
  const openPrint = () => {
    if (!eventId) return;
    window.open(`${BASE}/reports/print?event=${eventId}&doc=${docType}`, "_blank", "noopener");
  };

  return (
    <div className="stack">
      <div className="no-print row between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>ออกรายงาน</h1>
          <div className="subtitle">เลือกงาน แล้วพิมพ์เอกสารรวมทุกรายการในงานนั้น · ปีการศึกษา {yearBe}</div>
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
          <select value={eventId ?? ""} onChange={(e) => setEventId(Number(e.target.value) || null)}>
            {!events.length && <option value="">— ยังไม่มีงาน —</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>

        <div>
          <label className="form-label">ประเภทเอกสาร</label>
          <div className="auth-tabs" style={{ maxWidth: 760, flexWrap: "wrap" }}>
            {(Object.keys(DOC_LABEL) as DocType[]).map((t) => (
              <button key={t} className={`auth-tab${docType === t ? " active" : ""}`} onClick={() => setDocType(t)}>
                {DOC_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="alert alert-info">
          {isSummaryDoc
            ? `งานนี้มี ${selectedBundles.length} รายการ — เอกสารสรุปเป็นตารางรวมฉบับเดียว (กด "พิมพ์" เพื่อเปิดเอกสารในแท็บใหม่)`
            : `งานนี้มี ${selectedBundles.length} รายการ — กด "พิมพ์" เพื่อเปิดเอกสารในแท็บใหม่ (แต่ละรายการขึ้นหน้าใหม่)`}
        </div>
      </div>

      {/* เอกสารสรุป: แสดงตัวอย่างบนจอ (ตัวจริงพิมพ์จากแท็บใหม่ /reports/print) */}
      {isSummaryDoc && selectedBundles.length > 0 && (
        <div className="card">
          <SummarySheet bundles={selectedBundles} docType={docType as "summary" | "regcount"} eventName={eventName} yearBe={yearBe} />
        </div>
      )}
    </div>
  );
}
