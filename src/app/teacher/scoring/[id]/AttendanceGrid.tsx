"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { RosterEntry } from "@/lib/roster";

/**
 * เช็คชื่อผู้เข้าร่วม — ใช้แทนตารางกรอกคะแนนในรายการที่ "ไม่มีการแข่งขัน"
 *
 * รายการแบบนี้ไม่มีคะแนน/อันดับ/เหรียญ เหลือคำถามเดียวคือ "มาร่วมกิจกรรมจริงไหม"
 * ติ๊ก = เข้าร่วม = ได้เกียรติบัตร · ไม่ติ๊ก = ถือว่าไม่มาร่วม = ไม่ได้ใบ
 *
 * ค่าเริ่มต้นเป็น "ไม่ติ๊กทั้งหมด" เมื่อยังไม่เคยเช็คชื่อ (checkedAtText = null) — ตั้งใจให้เป็นแบบนั้น
 * ต้องมีคนยืนยันว่าเด็กมาจริงก่อนออกใบ ไม่ใช่ให้ทุกคนที่ลงทะเบียนไว้ได้ไปโดยปริยาย
 */
export function AttendanceGrid({
  competitionId,
  type,
  roster,
  checkedAtText,
}: {
  competitionId: number;
  type: "individual" | "team";
  roster: RosterEntry[];
  /** เช็คชื่อครั้งล่าสุดเมื่อไหร่ (ข้อความไทยพร้อมแสดง) — null = ยังไม่เคยเช็คชื่อ */
  checkedAtText: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const rows = roster.flatMap((e) => e.members.map((m) => ({ ...m, teamName: e.teamName })));

  // ยังไม่เคยเช็คชื่อ = ยังไม่มีใครถูกยืนยันว่ามา → เริ่มจากไม่ติ๊กทั้งหมด
  // (ข้อมูลที่ลงทะเบียนไว้ก่อนมีระบบเช็คชื่อมี absent = false ติดมาด้วย ถ้าอ่านจากตรงนั้นตรง ๆ
  //  หน้านี้จะขึ้นว่าทุกคนมาแล้วทั้งที่ยังไม่มีใครเช็ค)
  const [present, setPresent] = useState<Set<number>>(
    () => new Set(checkedAtText ? rows.filter((m) => !m.absent).map((m) => m.memberId) : [])
  );
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(checkedAtText);

  const toggle = (memberId: number, on: boolean) =>
    setPresent((prev) => {
      const next = new Set(prev);
      if (on) next.add(memberId);
      else next.delete(memberId);
      return next;
    });

  // ผลการบันทึกไปออกที่ toast (มุมจอ) ไม่ใช่แถบบนสุดของหน้า — ปุ่มบันทึกอยู่ท้ายรายชื่อยาว ๆ
  // ครูกดแล้วไม่ได้เลื่อนขึ้นไปดู จึงไม่เห็นว่าบันทึกสำเร็จหรือพัง
  async function save() {
    setBusy(true);
    const res = await api.post(`/api/competitions/${competitionId}/attendance`, {
      presentMemberIds: [...present],
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    const missing = rows.length - present.size;
    setSavedAt("เมื่อสักครู่");
    toast(
      missing
        ? `บันทึกการเช็คชื่อแล้ว · เข้าร่วม ${present.size} คน · ไม่มาร่วม ${missing} คน (จะไม่ได้รับเกียรติบัตร)`
        : `บันทึกการเช็คชื่อแล้ว · เข้าร่วมครบทั้ง ${present.size} คน`
    );
    router.refresh();
  }

  if (!rows.length) {
    return (
      <div className="empty-state card">
        <Icon name="clipboard" size={44} className="empty-ico" />
        <p>ยังไม่มีผู้ลงทะเบียนให้เช็คชื่อ</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="alert alert-info">
        รายการนี้ไม่มีการแข่งขัน จึงไม่มีคะแนน — ติ๊ก “เข้าร่วม” ให้คนที่มาร่วมกิจกรรมจริง
        <br />
        คนที่ติ๊กจะได้เกียรติบัตร “เข้าร่วมกิจกรรม” · คนที่ไม่ติ๊กถือว่าไม่มาร่วม จึงไม่ได้รับใบ
        {!savedAt && (
          <>
            <br />
            <strong>ยังไม่ได้เช็คชื่อรายการนี้</strong> — ต้องเช็คชื่อและกดบันทึกก่อน จึงจะออกเกียรติบัตรได้
          </>
        )}
      </div>

      <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="text-sm">
          เข้าร่วม <strong>{present.size}</strong> / {rows.length} คน
          {savedAt && <span className="muted"> · เช็คชื่อล่าสุด {savedAt}</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPresent(new Set(rows.map((m) => m.memberId)))}
          >
            ติ๊กทั้งหมด
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPresent(new Set())}>
            ล้างทั้งหมด
          </button>
        </div>
      </div>

      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>เข้าร่วม</th>
              <th>ชื่อ - นามสกุล</th>
              <th>ชั้น</th>
              {type === "team" && <th>ทีม</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const here = present.has(m.memberId);
              return (
                <tr key={m.memberId}>
                  <td data-label="เข้าร่วม">
                    <label className="form-check" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={here}
                        onChange={(ev) => toggle(m.memberId, ev.target.checked)}
                        aria-label={`เข้าร่วม: ${m.name}`}
                      />
                      <span className={here ? "" : "muted"}>{here ? "เข้าร่วม" : "ไม่มาร่วม"}</span>
                    </label>
                  </td>
                  <td className="td-title" style={here ? undefined : { opacity: 0.6 }}>
                    {m.name}
                    {/* คนนี้เข้ามาแทนคนเดิม — ป้ายนี้อยู่แค่หน้านี้ ไม่ตามไปบนเกียรติบัตร */}
                    {m.substituted && (
                      <span className="badge badge-purple" style={{ marginLeft: 6 }}>
                        เปลี่ยนตัว
                      </span>
                    )}
                  </td>
                  <td className="text-sm" data-label="ชั้น">
                    {m.classLevel}/{m.classRoom}
                    {m.classNumber && <span className="muted"> เลขที่ {m.classNumber}</span>}
                  </td>
                  {type === "team" && (
                    <td className="text-sm" data-label="ทีม">
                      {m.teamName ?? "-"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "กำลังบันทึก…" : "บันทึกการเช็คชื่อ"}
        </button>
      </div>
      <p className="form-hint">
        ติ๊กเพิ่ม/เอาติ๊กออกได้ตลอด แต่ต้องกด “บันทึกการเช็คชื่อ” ทุกครั้งจึงจะมีผล
        <br />
        ถ้าออกเกียรติบัตรไปแล้วแล้วมาเอาติ๊กออกทีหลัง ใบที่ออกไปแล้วจะไม่หายไปเอง —
        ต้องแจ้งผู้ดูแลระบบให้ยกเลิกการออกเกียรติบัตรของรายการนี้ แล้วออกใหม่
      </p>
    </div>
  );
}
