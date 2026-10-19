"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { nameInitial } from "@/lib/initials";

type SortKey = "group" | "code" | "name";
type ViewMode = "grid" | "list";
const VIEW_KEY = "arena.teacherPicker.view";

export type TeacherOption = {
  code: string;
  name: string;
  /** ชื่อกลุ่มสาระ ("" = ไม่ระบุ) — ใช้กรอง/จัดกลุ่มเท่านั้น */
  group: string;
  /** ไม่อยู่ในรายชื่อครูที่ยังทำงานอยู่แล้ว (ลาออก/ย้าย) แต่ถูกติ๊กไว้ก่อนหน้า */
  inactive?: boolean;
  /** ชื่อที่พิมพ์เพิ่มเอง (ไม่มีใน SchoolOS) — code เป็นรหัสภายใน EXT-xxx ไม่ต้องโชว์ */
  manual?: boolean;
};

type SaveResult = { present: number; added: number; removed: number; keptForCertificates: number };

/** เรียงรหัสครูแบบตัวเลขในข้อความ ("T2" มาก่อน "T10") ; ชื่อที่พิมพ์เองไปอยู่ท้ายสุด */
const byCode = (a: TeacherOption, b: TeacherOption) =>
  Number(!!a.manual) - Number(!!b.manual) || a.code.localeCompare(b.code, "th", { numeric: true });

/** เทียบชื่อโดยไม่สนช่องว่าง — "นายสมชาย  ใจดี" กับ "นายสมชาย ใจดี" คือคนเดียวกัน */
const sameName = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

const NO_GROUP = "ไม่ระบุกลุ่มสาระ";

function CheckMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * ติ๊กรายชื่อครูที่เข้าร่วมกิจกรรมของครู — ใช้แทนตารางเช็คชื่อนักเรียน
 *
 * ครูไม่ได้สมัครเอง ผู้จัดเลือกจากรายชื่อครูทั้งโรงเรียนแล้วกดบันทึกครั้งเดียว
 * ติ๊ก = เข้าร่วม = ได้เกียรติบัตร "เข้าร่วมกิจกรรม" · ไม่ติ๊ก = ไม่อยู่ในรายชื่อ
 *
 * หน้าตาเป็นการ์ดแตะทั้งใบ (ไม่ใช่ checkbox เล็ก ๆ ในตาราง) — ~70% ของครูใช้มือถือ
 * ผลการบันทึกขึ้นเป็นกล่องกลางจอ ไม่ใช่ toast มุมจอ: บันทึกรายชื่อคนทั้งโรงเรียนเป็นเรื่องใหญ่
 * ผู้ใช้ต้องเห็นชัด ๆ ว่าสำเร็จแล้ว และไปต่อที่หน้าออกเกียรติบัตรได้ทันที
 */
export function TeacherPicker({
  competitionId,
  teachers,
  initialCodes,
  checkedAtText,
  loadError,
  certHref,
}: {
  competitionId: number;
  teachers: TeacherOption[];
  /** รหัสครูที่ติ๊กไว้แล้ว */
  initialCodes: string[];
  /** บันทึกครั้งล่าสุดเมื่อไหร่ — null = ยังไม่เคยบันทึก */
  checkedAtText: string | null;
  /** ดึงรายชื่อครูจาก SchoolOS ไม่สำเร็จ — ยังเห็นคนที่ติ๊กไว้แล้ว แต่เพิ่มคนใหม่ไม่ได้ */
  loadError: boolean;
  /** หน้าออกเกียรติบัตรของงานนี้ (null = รายการยังไม่อยู่ในงาน) — ปุ่มไปต่อหลังบันทึก */
  certHref: string | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initialCodes));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialCodes));
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("group");
  // การ์ด (ค่าเริ่มต้น) หรือรายการแถวเดียวแน่น ๆ — จำไว้ในเบราว์เซอร์ คนที่ถนัดแบบไหนไม่ต้องกดใหม่ทุกครั้ง
  const [view, setView] = useState<ViewMode>("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {
      // ปิด storage ไว้ (โหมดส่วนตัว) — ใช้ค่าเริ่มต้นไป
    }
  }, []);
  const chooseView = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // จำไม่ได้ก็ไม่เป็นไร
    }
  };
  // ชื่อที่พิมพ์เพิ่มแต่ยังไม่ได้บันทึก — บันทึกแล้วจะกลับมาเป็นแถวปกติ (manual) จากเซิร์ฟเวอร์
  const [pending, setPending] = useState<string[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualErr, setManualErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(checkedAtText);
  const [result, setResult] = useState<{ ok: true; data: SaveResult } | { ok: false; error: string } | null>(null);

  const total = picked.size + pending.length;
  const dirty =
    pending.length > 0 || picked.size !== saved.size || [...picked].some((c) => !saved.has(c));

  // มีของยังไม่บันทึก → เตือนก่อนปิดแท็บ/รีเฟรช (ติ๊กไปครึ่งโรงเรียนแล้วหายเพราะเผลอปิด = เสียเวลามาก)
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // ชิปกลุ่มสาระ + จำนวนที่ติ๊กในแต่ละกลุ่ม
  const groups = useMemo(() => {
    const m = new Map<string, { all: number; on: number }>();
    for (const t of teachers) {
      const g = t.group || NO_GROUP;
      const row = m.get(g) ?? { all: 0, on: 0 };
      row.all++;
      if (picked.has(t.code)) row.on++;
      m.set(g, row);
    }
    return [...m.entries()].sort((a, b) =>
      a[0] === NO_GROUP ? 1 : b[0] === NO_GROUP ? -1 : a[0].localeCompare(b[0], "th")
    );
  }, [teachers, picked]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = teachers.filter(
      (t) =>
        (!group || (t.group || NO_GROUP) === group) &&
        (!onlyPicked || picked.has(t.code)) &&
        (!needle || t.name.toLowerCase().includes(needle) || (!t.manual && t.code.toLowerCase().includes(needle)))
    );
    // teachers มาจากเซิร์ฟเวอร์เรียงตามกลุ่มสาระ → ชื่อ อยู่แล้ว
    if (sortKey === "code") return [...list].sort(byCode);
    if (sortKey === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "th"));
    return list;
  }, [teachers, q, group, onlyPicked, picked, sortKey]);

  const shownOn = shown.filter((t) => picked.has(t.code)).length;

  const toggle = (code: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  // ติ๊ก/ล้าง เฉพาะคนที่กำลังแสดงอยู่ — เลือกชิปกลุ่มสาระแล้วกด "เลือกทั้งหมด" = ทั้งกลุ่มสาระ
  const setShown = (on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const t of shown) {
        if (on) next.add(t.code);
        else next.delete(t.code);
      }
      return next;
    });

  function addManual() {
    const name = manualName.trim().replace(/\s+/g, " ");
    if (!name) return;
    if ([...pending, ...teachers.map((t) => t.name)].some((n) => sameName(n, name))) {
      setManualErr(`มีชื่อ “${name}” อยู่ในรายชื่อแล้ว — ค้นหาแล้วแตะเลือกแทน`);
      return;
    }
    setManualErr(null);
    setPending((p) => [...p, name]);
    setManualName("");
  }

  async function save() {
    setBusy(true);
    const res = await api.post<SaveResult>(`/api/competitions/${competitionId}/teachers`, {
      teacherCodes: [...picked],
      manualNames: pending,
    });
    setBusy(false);
    if (!res.ok) return setResult({ ok: false, error: res.error });
    setSaved(new Set(picked));
    setPending([]);
    setSavedAt("เมื่อสักครู่");
    setResult({ ok: true, data: res.data });
    router.refresh();
  }

  return (
    <div className="stack tp">
      {/* ── สรุป ── */}
      <div className="tp-summary">
        <div className="tp-stat">
          <span className="tp-stat-ico"><Icon name="users" size={22} /></span>
          <div>
            <div className="tp-stat-value">{total}</div>
            <div className="tp-stat-label">ครูที่เข้าร่วม</div>
          </div>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-ico tp-stat-ico-muted"><Icon name="user" size={22} /></span>
          <div>
            <div className="tp-stat-value">{teachers.filter((t) => !t.manual).length}</div>
            <div className="tp-stat-label">ครูทั้งหมดในระบบ</div>
          </div>
        </div>
        <div className={`tp-stat ${savedAt && !dirty ? "tp-stat-ok" : "tp-stat-warn"}`}>
          <span className="tp-stat-ico">{savedAt && !dirty ? <CheckMark size={20} /> : <Icon name="clock" size={22} />}</span>
          <div>
            <div className="tp-stat-state">
              {!savedAt ? "ยังไม่เคยบันทึก" : dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว"}
            </div>
            <div className="tp-stat-label">{savedAt ? `บันทึกล่าสุด ${savedAt}` : "ต้องบันทึกก่อนจึงออกเกียรติบัตรได้"}</div>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="alert alert-warning">
          ดึงรายชื่อครูจาก SchoolOS ไม่สำเร็จ — ตอนนี้เห็นเฉพาะครูที่เลือกไว้แล้ว ลองรีเฟรชหน้าอีกครั้งเพื่อเลือกเพิ่ม
        </div>
      )}

      {/* ── ค้นหา / กรอง / เรียง ── */}
      <div className="card tp-toolbar">
        <div className="tp-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="ค้นหาชื่อหรือรหัสครู"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="ค้นหาชื่อหรือรหัสครู"
          />
          {q && (
            <button type="button" className="tp-search-clear" onClick={() => setQ("")} aria-label="ล้างคำค้นหา">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        {groups.length > 1 && (
          <div className="group-chips tp-chips">
            <button type="button" className={`group-chip${!group ? " on" : ""}`} onClick={() => setGroup("")}>
              ทุกกลุ่มสาระ <span className="n">{picked.size}/{teachers.length}</span>
            </button>
            {groups.map(([g, c]) => (
              <button key={g} type="button" className={`group-chip${group === g ? " on" : ""}`} onClick={() => setGroup(group === g ? "" : g)}>
                {g} <span className="n">{c.on}/{c.all}</span>
              </button>
            ))}
          </div>
        )}

        <div className="tp-controls">
          <div className="tp-sort">
            <span className="text-sm muted">เรียงตาม</span>
            <div className="seg" role="group" aria-label="เรียงตาม">
              {([
                ["group", "กลุ่มสาระ"],
                ["code", "รหัสครู"],
                ["name", "ชื่อ"],
              ] as const).map(([k, label]) => (
                <button key={k} type="button" className={`seg-btn${sortKey === k ? " on" : ""}`} onClick={() => setSortKey(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="รูปแบบการแสดง">
              <button type="button" className={`seg-btn${view === "grid" ? " on" : ""}`} onClick={() => chooseView("grid")}>
                การ์ด
              </button>
              <button type="button" className={`seg-btn${view === "list" ? " on" : ""}`} onClick={() => chooseView("list")}>
                รายการ
              </button>
            </div>
          </div>
          <div className="tp-bulk">
            <button type="button" className={`group-chip${onlyPicked ? " on" : ""}`} onClick={() => setOnlyPicked((v) => !v)}>
              เฉพาะที่เลือก
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShown(true)} disabled={!shown.length || shownOn === shown.length}>
              เลือกทั้งหมด{shown.length !== teachers.length ? ` (${shown.length})` : ""}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown(false)} disabled={!shownOn}>
              ล้าง
            </button>
          </div>
        </div>
      </div>

      {/* ── รายชื่อ (แตะทั้งแถว/ทั้งการ์ดเพื่อเลือก) ── */}
      {shown.length && view === "list" ? (
        <div className="tp-list" role="list">
          <div className="tp-list-head" aria-hidden>
            <span />
            <span>รหัส</span>
            <span>ชื่อ - นามสกุล</span>
            <span>กลุ่มสาระ</span>
          </div>
          {shown.map((t) => {
            const on = picked.has(t.code);
            return (
              <button
                key={t.code}
                type="button"
                role="listitem"
                className={`tp-row${on ? " on" : ""}`}
                onClick={() => toggle(t.code)}
                aria-pressed={on}
              >
                <span className="tp-check" aria-hidden>
                  {on && <CheckMark />}
                </span>
                <span className="tp-row-code">
                  {t.manual ? <span className="tp-tag tp-tag-purple">เพิ่มเอง</span> : t.code}
                </span>
                <span className="tp-row-name">
                  {t.name}
                  {t.inactive && <span className="tp-tag" style={{ marginLeft: 6 }}>ไม่อยู่ในรายชื่อปัจจุบัน</span>}
                </span>
                <span className="tp-row-group">{t.group || "-"}</span>
              </button>
            );
          })}
        </div>
      ) : shown.length ? (
        <div className="tp-grid">
          {shown.map((t) => {
            const on = picked.has(t.code);
            return (
              <button
                key={t.code}
                type="button"
                className={`tp-card${on ? " on" : ""}`}
                onClick={() => toggle(t.code)}
                aria-pressed={on}
              >
                <span className="tp-avatar">{nameInitial(t.name)}</span>
                <span className="tp-info">
                  <span className="tp-name">{t.name}</span>
                  <span className="tp-meta">
                    {t.manual ? (
                      <span className="tp-tag tp-tag-purple">เพิ่มเอง</span>
                    ) : (
                      <span className="tp-code">{t.code}</span>
                    )}
                    {t.group && <span className="tp-group">{t.group}</span>}
                    {t.inactive && <span className="tp-tag">ไม่อยู่ในรายชื่อปัจจุบัน</span>}
                  </span>
                </span>
                <span className="tp-check" aria-hidden>
                  {on && <CheckMark />}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-state card">
          <Icon name="search" size={44} className="empty-ico" />
          <p>{teachers.length ? "ไม่พบครูตามที่ค้นหา" : "ไม่มีรายชื่อครู"}</p>
          {(q || group || onlyPicked) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setGroup(""); setOnlyPicked(false); }}>
              ล้างตัวกรอง
            </button>
          )}
        </div>
      )}

      {/* ── ครูที่ไม่มีในรายชื่อ SchoolOS (วิทยากร/อัตราจ้าง/ต่างโรงเรียน) ── */}
      <div className="card tp-manual">
        <div className="tp-manual-head">
          <span className="tp-stat-ico"><Icon name="plus" size={20} /></span>
          <div>
            <div className="tp-manual-title">เพิ่มชื่อที่ไม่มีในรายชื่อ</div>
            <div className="text-sm muted">เช่น วิทยากร ครูอัตราจ้าง หรือครูต่างโรงเรียน — ชื่อจะพิมพ์ลงเกียรติบัตรตามที่พิมพ์ทุกตัวอักษร</div>
          </div>
        </div>
        <div className="tp-manual-row">
          <input
            className="form-input"
            placeholder="คำนำหน้า ชื่อ นามสกุล เช่น นางสาวสมใจ ใจดี"
            value={manualName}
            maxLength={191}
            onChange={(e) => {
              setManualName(e.target.value);
              setManualErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addManual();
              }
            }}
          />
          <button type="button" className="btn btn-primary" onClick={addManual} disabled={!manualName.trim()}>
            เพิ่ม
          </button>
        </div>
        {manualErr && <div className="form-error">{manualErr}</div>}
        {pending.length > 0 && (
          <div className="tp-pending">
            {pending.map((n) => (
              <span key={n} className="tp-pending-chip">
                {n}
                <button type="button" onClick={() => setPending((p) => p.filter((x) => x !== n))} aria-label={`เอา ${n} ออก`}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="form-hint">
        ถ้าออกเกียรติบัตรไปแล้วแล้วมาเอาชื่อออกทีหลัง ใบที่ออกไปแล้วจะไม่หายไปเอง —
        ต้องแจ้งผู้ดูแลระบบให้ยกเลิกการออกเกียรติบัตรของรายการนี้ แล้วออกใหม่
      </p>

      {/* ── แถบบันทึก ลอยติดขอบล่างเสมอ ── */}
      <div className={`tp-savebar${dirty ? " dirty" : ""}`}>
        <div className="tp-savebar-text">
          <strong>เลือกแล้ว {total} คน</strong>
          <span className="text-sm muted">{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : savedAt ? "บันทึกแล้ว" : "ยังไม่ได้บันทึก"}</span>
        </div>
        <button className="btn btn-primary tp-savebtn" onClick={save} disabled={busy || (!dirty && !!savedAt)}>
          {busy ? (
            <>
              <span className="tp-spinner" aria-hidden /> กำลังบันทึก…
            </>
          ) : (
            "บันทึกรายชื่อ"
          )}
        </button>
      </div>

      {/* ── ผลการบันทึก (กล่องกลางจอ) ── */}
      {result && (
        <div className="modal-overlay" onClick={() => setResult(null)}>
          <div className="modal tp-result" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {result.ok ? (
              <>
                <div className="tp-result-ico ok"><CheckMark size={34} /></div>
                <h3 className="tp-result-title">บันทึกรายชื่อเรียบร้อย</h3>
                <p className="tp-result-big">
                  ครูเข้าร่วม <strong>{result.data.present}</strong> คน
                </p>
                {(result.data.added > 0 || result.data.removed > 0) && (
                  <div className="tp-result-diff">
                    {result.data.added > 0 && <span className="badge badge-success">เพิ่ม {result.data.added} คน</span>}
                    {result.data.removed > 0 && <span className="badge badge-warning">เอาออก {result.data.removed} คน</span>}
                  </div>
                )}
                {result.data.keptForCertificates > 0 && (
                  <div className="alert alert-warning text-sm" style={{ textAlign: "left" }}>
                    {result.data.keptForCertificates} คนที่เอาออกได้รับเกียรติบัตรไปแล้ว ใบเดิมยังอยู่ — แจ้งผู้ดูแลระบบถ้าต้องการยกเลิก
                  </div>
                )}
                <div className="tp-result-actions">
                  {certHref && result.data.present > 0 && (
                    <Link href={certHref} className="btn btn-primary">ไปออกเกียรติบัตร</Link>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => setResult(null)} autoFocus>
                    ปิด
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="tp-result-ico err"><Icon name="warning" size={32} /></div>
                <h3 className="tp-result-title">บันทึกไม่สำเร็จ</h3>
                <p className="tp-result-msg">{result.error}</p>
                <div className="tp-result-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setResult(null)} autoFocus>
                    ตกลง
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
