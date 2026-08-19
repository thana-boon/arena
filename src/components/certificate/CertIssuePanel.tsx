"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { useConfirm } from "@/components/ConfirmDialog";
import type { CertIssueCompRow } from "@/lib/certIssuing";

// window.open ไม่ถูกเติม basePath (/arena) ให้อัตโนมัติเหมือน <Link> — ต้อง prefix เอง
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * ชั้นที่สองของหน้าออกเกียรติบัตร — รายการทั้งหมดในงานที่เลือก
 *
 * แยกเป็นสองจังหวะโดยตั้งใจ: "ออกเกียรติบัตร" (จองเลขทะเบียน) กับ "PDF" (เปิดแท็บพิมพ์)
 * เดิมกดออกแล้วเด้งแท็บพิมพ์ทันที ทั้งช้าและกดพลาดง่าย — และครูที่แค่อยากเปิดดู/พิมพ์ซ้ำ
 * ต้องยิงออกใบใหม่ทุกครั้ง ตอนนี้ปุ่ม PDF อ่านจาก id ใบที่ออกไปแล้ว ไม่แตะทะเบียนเลย
 */
export function CertIssuePanel({
  eventName,
  rows,
  backHref,
  canUndo,
}: {
  eventName: string;
  rows: CertIssueCompRow[];
  backHref: string;
  /** ปุ่ม "ยกเลิกการออก" ให้เฉพาะ admin — ครูออกใบเองได้ แต่การถอนคืนต้องผ่าน admin (ดู undo()) */
  canUndo: boolean;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  // id ใบที่เพิ่งออกในจอนี้ — ทับค่าจากเซิร์ฟเวอร์ไว้ก่อน เพราะกว่า router.refresh() จะกลับมา ปุ่ม PDF ต้องกดได้แล้ว
  const [justIssued, setJustIssued] = useState<Record<number, number[]>>({});
  const confirm = useConfirm();
  const router = useRouter();

  const idsOf = (r: CertIssueCompRow) => justIssued[r.id] ?? r.issueIds;

  async function issue(r: CertIssueCompRow) {
    // ออกใบ = จองเลขทะเบียนของโรงเรียนจริง ๆ ต้องถามยืนยันก่อนเสมอ (ถอนคืนได้เฉพาะ admin)
    const okDo = await confirm({
      title: "ยืนยันการออกเกียรติบัตร",
      message: `ออกเกียรติบัตรของ “${r.name}” ให้ผู้เข้าร่วมทุกคน (${r.activeEntries} รายการที่ลงทะเบียน) และจองเลขทะเบียนให้ทุกใบ · ยังไม่เปิดไฟล์ให้พิมพ์ ต้องการพิมพ์ค่อยกดปุ่ม “PDF” ทีหลัง`,
      confirmText: "ออกเกียรติบัตร",
    });
    if (!okDo) return;

    setBusyId(r.id);
    setMsg(null);
    const res = await api.post<{ issueIds: number[]; count: number; newCount: number }>(
      "/api/certificates/issue",
      { competitionId: r.id },
      // ออกเกียรติบัตรทั้งรายการทีเดียว (จองเลขทะเบียน + สร้าง QR ทุกใบ) — เผื่อเวลามากกว่าปกติ
      { timeoutMs: 60_000 }
    );
    setBusyId(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    if (!res.data.issueIds.length)
      return setMsg({ type: "error", text: "ไม่มีผู้เข้าแข่งขันให้ออกเกียรติบัตร" });

    setJustIssued((m) => ({ ...m, [r.id]: res.data.issueIds }));
    setMsg({
      type: "success",
      text:
        `ออกเกียรติบัตรของ “${r.name}” แล้ว ${res.data.count} ใบ (ใหม่ ${res.data.newCount} ใบ) · กดปุ่ม “PDF” เพื่อเปิดแท็บสำหรับพิมพ์/บันทึกเป็นไฟล์` +
        (canUndo
          ? " · ถ้าแค่ลองดู กด “ยกเลิกการออก” เพื่อถอนคืนได้"
          : " · ออกไปแล้วถอนคืนเองไม่ได้ ถ้าออกผิดต้องแจ้งผู้ดูแลระบบ"),
    });
    router.refresh(); // ช่อง "ออกแล้ว" กับปุ่มยกเลิกมาจากฝั่งเซิร์ฟเวอร์ ต้องดึงใหม่
  }

  /** เปิดแท็บใหม่ไปหน้าพิมพ์ของใบที่ออกไปแล้ว (ยกภาระ save PDF ให้ผู้ใช้ตามเดิม) */
  function openPdf(r: CertIssueCompRow) {
    const ids = idsOf(r);
    if (!ids.length) return setMsg({ type: "error", text: "รายการนี้ยังไม่ได้ออกเกียรติบัตร" });
    // เรียกตรงจากปุ่ม ไม่ผ่าน await ก่อน — ไม่งั้นตัวกันป๊อปอัปของเบราว์เซอร์จะบล็อกแท็บใหม่
    window.open(`${BASE}/certificates/print?ids=${ids.join(",")}`, "_blank");
  }

  /**
   * ถอนใบทั้งล็อตของรายการนี้ — เฉพาะ admin (ฝั่ง API ก็บังคับ role เดียวกัน)
   * เดิมครูถอนเองได้ แต่การถอนลบใบทิ้งจริงและทำให้ QR บนใบที่แจกไปแล้วตรวจไม่ผ่าน
   * จึงเป็นงานที่ต้องมีคนกลางตัดสินใจ ไม่ใช่ปุ่มที่กดพลาดข้าง ๆ ปุ่ม PDF ได้
   */
  async function undo(r: CertIssueCompRow) {
    const okDo = await confirm({
      title: "ยกเลิกการออกเกียรติบัตร",
      message: `ลบเกียรติบัตรของ “${r.name}” ทั้งหมด ${r.issuedCount} ใบ แล้วคืนเลขทะเบียนที่จองไว้ · ถ้ามีใบที่พิมพ์แจกไปแล้ว ใบเหล่านั้นจะสแกน QR ตรวจสอบไม่ผ่านอีกต่อไป`,
      confirmText: "ยกเลิกการออก",
      danger: true,
    });
    if (!okDo) return;

    setBusyId(r.id);
    setMsg(null);
    const res = await api.del<{ count: number; eventUnlocked: boolean }>(
      "/api/certificates/issue",
      { competitionId: r.id },
      { timeoutMs: 60_000 }
    );
    setBusyId(null);
    if (!res.ok) return setMsg({ type: "error", text: res.error });

    setJustIssued((m) => {
      const next = { ...m };
      delete next[r.id]; // ใบถูกลบไปแล้ว ปุ่ม PDF ต้องหายตาม ไม่ใช่ค้างชี้ id ที่ไม่มีอยู่จริง
      return next;
    });
    setMsg({
      type: "success",
      text: `ยกเลิกเกียรติบัตรของ “${r.name}” แล้ว ${res.data.count} ใบ${
        res.data.eventUnlocked ? " · งานนี้ไม่เหลือใบที่ออกไว้ กลับไปแก้แม่แบบได้แล้ว" : ""
      }`,
    });
    router.refresh();
  }

  return (
    <div className="stack">
      <div className="page-bar">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>{eventName}</h1>
          <div className="subtitle">
            เลือกรายการเพื่อออกเกียรติบัตรให้ผู้เข้าร่วมทุกคน · ระบบจะถามยืนยันก่อนออก จากนั้นกดปุ่ม “PDF”
            เพื่อเปิดแท็บใหม่ให้บันทึกเป็นไฟล์ (Ctrl/⌘+P)
            {" · "}
            {canUndo
              ? "กดออกไปแล้วถอนคืนได้ด้วยปุ่ม “ยกเลิกการออก” (ลองดูหน้าตาใบก่อนได้ ไม่เปลืองเลขทะเบียน)"
              : "ออกไปแล้วถอนคืนเองไม่ได้ (เลขทะเบียนถูกจองทันที) — ถ้าออกผิดต้องแจ้งผู้ดูแลระบบให้ยกเลิกให้"}
          </div>
        </div>
        <Link href={backHref} className="btn btn-sm">
          <Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> เลือกงานอื่น
        </Link>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {!rows.length ? (
        <div className="empty-state card">
          <Icon name="file" size={44} className="empty-ico" />
          <p>ยังไม่มีรายการในงานนี้ที่อยู่ในความดูแลของท่าน</p>
        </div>
      ) : (
        <div className="table-wrap table-cards">
          <table className="table">
            <thead>
              <tr>
                <th>รายการแข่งขัน</th>
                <th>หมวด</th>
                <th className="num">ผู้เข้าร่วม</th>
                <th className="num">ออกแล้ว</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td-title">{r.name}</td>
                  <td data-label="หมวด">{r.groupName || <span className="muted">—</span>}</td>
                  <td className="num" data-label="ผู้เข้าร่วม">{r.activeEntries}</td>
                  <td className="num" data-label="ออกแล้ว">
                    {idsOf(r).length > 0 ? `${idsOf(r).length} ใบ` : <span className="muted">—</span>}
                  </td>
                  <td className="num td-actions">
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      {/* ออกไปแล้ว: ปุ่มออกกลายเป็น PDF (+ ยกเลิก เฉพาะ admin) แม้รายการจะกลับไปสถานะออกใหม่ไม่ได้ */}
                      {idsOf(r).length > 0 ? (
                        <>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => openPdf(r)}
                            disabled={busyId === r.id}
                            title="เปิดแท็บใหม่สำหรับพิมพ์/บันทึกเป็น PDF"
                          >
                            <Icon name="printer" size={16} /> PDF
                          </button>
                          {canUndo && (
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => undo(r)}
                              disabled={busyId === r.id}
                              title="ลบใบที่ออกไปแล้วทั้งหมดของรายการนี้ และคืนเลขทะเบียน"
                            >
                              <Icon name="close" size={16} />{" "}
                              {busyId === r.id ? "กำลังทำงาน…" : "ยกเลิกการออก"}
                            </button>
                          )}
                        </>
                      ) : r.ready ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => issue(r)}
                          disabled={busyId === r.id}
                        >
                          <Icon name="file" size={16} />{" "}
                          {busyId === r.id ? "กำลังทำงาน…" : "ออกเกียรติบัตร"}
                        </button>
                      ) : (
                        <span className="badge">{r.reason}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
