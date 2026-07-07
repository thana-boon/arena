"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { CLASS_LEVELS } from "@/lib/domain";
import { useClassRooms } from "@/lib/useClassRooms";

export type PickedStudent = { studentCode: string; name: string; classLevel: string; classRoom: string };

export function StudentPicker({
  onPick,
  excludeCodes = [],
  levels,
  remaining,
}: {
  onPick: (s: PickedStudent) => void;
  excludeCodes?: string[];
  /** จำกัดระดับชั้นที่เลือกได้ (เช่น ระดับที่รายการแข่งขันเปิดรับ) — ไม่ส่ง = ทั้งหมด */
  levels?: string[];
  /** จำนวนที่ยังเพิ่มได้ (ใช้จำกัดโหมดเลือกทั้งห้อง) — ไม่ส่ง = ไม่จำกัด */
  remaining?: number;
}) {
  const levelOptions = levels && levels.length ? levels : (CLASS_LEVELS as readonly string[]);
  const [mode, setMode] = useState<"search" | "room">("search");
  const canAdd = remaining === undefined || remaining > 0;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="sp-tabs">
        <button type="button" className={`sp-tab ${mode === "search" ? "on" : ""}`} onClick={() => setMode("search")}>
          ค้นหาชื่อ/รหัส
        </button>
        <button type="button" className={`sp-tab ${mode === "room" ? "on" : ""}`} onClick={() => setMode("room")}>
          เลือกทั้งห้อง
        </button>
      </div>

      {mode === "search" ? (
        <SearchMode onPick={onPick} excludeCodes={excludeCodes} levelOptions={levelOptions} canAdd={canAdd} />
      ) : (
        <RoomMode onPick={onPick} excludeCodes={excludeCodes} levelOptions={levelOptions} remaining={remaining} />
      )}
    </div>
  );
}

/* ---------- โหมดค้นสด (พิมพ์แล้วขึ้น dropdown ทันที) ---------- */
function SearchMode({
  onPick,
  excludeCodes,
  levelOptions,
  canAdd,
}: {
  onPick: (s: PickedStudent) => void;
  excludeCodes: string[];
  levelOptions: readonly string[];
  canAdd: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedStudent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  // ถ้ารายการแข่งเปิดรับระดับเดียว บังคับค้นเฉพาะระดับนั้น
  const onlyLevel = levelOptions.length === 1 ? levelOptions[0] : "";

  // ค้นสดแบบ debounce
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const sp = new URLSearchParams();
      sp.set("q", term);
      if (onlyLevel) sp.set("class_level", onlyLevel);
      const res = await api.get<{ students: PickedStudent[] }>(`/api/students/search?${sp.toString()}`);
      if (id !== reqId.current) return; // ผลเก่า ทิ้ง
      setBusy(false);
      if (!res.ok) return setErr(res.error);
      setErr("");
      setResults(res.data.students);
      setActive(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q, onlyLevel]);

  const allow = new Set(levelOptions);
  const shown = (results ?? []).filter(
    (s) => !excludeCodes.includes(s.studentCode) && allow.has(s.classLevel),
  );

  function pick(s: PickedStudent) {
    if (!canAdd) return;
    onPick(s);
    inputRef.current?.focus(); // เพิ่มต่อได้ทันที (แถวที่เพิ่มแล้วจะหายเองจาก excludeCodes)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !shown.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = shown[active];
      if (s) pick(s);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showMenu = open && q.trim().length >= 1;

  return (
    <div className="sp-combo">
      <input
        ref={inputRef}
        className="form-input"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="พิมพ์ชื่อ หรือ รหัสนักเรียน…"
        autoComplete="off"
      />
      {err && <div className="form-error mt-2">{err}</div>}
      {showMenu && (
        <div className="sp-menu">
          {busy && !shown.length ? (
            <div className="sp-empty">กำลังค้นหา…</div>
          ) : !shown.length ? (
            <div className="sp-empty">{results === null ? "กำลังค้นหา…" : "ไม่พบนักเรียน"}</div>
          ) : (
            shown.map((s, i) => (
              <div
                key={s.studentCode}
                className={`sp-opt ${i === active ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              >
                <span>{s.name}</span>
                <span className="sp-code">{s.classLevel}/{s.classRoom} · {s.studentCode}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- โหมดเลือกทั้งห้อง (ติ๊กหลายคน เพิ่มรวดเดียว) ---------- */
function RoomMode({
  onPick,
  excludeCodes,
  levelOptions,
  remaining,
}: {
  onPick: (s: PickedStudent) => void;
  excludeCodes: string[];
  levelOptions: readonly string[];
  remaining?: number;
}) {
  const [level, setLevel] = useState(levelOptions.length === 1 ? levelOptions[0] : "");
  const [room, setRoom] = useState("");
  const [list, setList] = useState<PickedStudent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { rooms } = useClassRooms(level);
  const reqId = useRef(0);

  // เปลี่ยนระดับ → ล้างห้อง
  useEffect(() => { setRoom(""); }, [level]);
  // เปลี่ยนห้อง → ล้างที่ติ๊กไว้
  useEffect(() => { setChecked(new Set()); }, [level, room]);

  // โหลดนักเรียนทั้งห้องเมื่อเลือกครบ
  useEffect(() => {
    if (!level || !room) { setList(null); return; }
    setBusy(true); setErr("");
    const id = ++reqId.current;
    const sp = new URLSearchParams();
    sp.set("class_level", level);
    sp.set("class_room", room);
    api.get<{ students: PickedStudent[] }>(`/api/students/search?${sp.toString()}`).then((res) => {
      if (id !== reqId.current) return;
      setBusy(false);
      if (!res.ok) return setErr(res.error);
      setList(res.data.students);
    });
  }, [level, room]);

  const alreadyIn = new Set(excludeCodes);
  const available = (list ?? []).filter((s) => !alreadyIn.has(s.studentCode));
  const capReached = remaining !== undefined && checked.size >= remaining;

  function toggle(code: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else if (remaining === undefined || next.size < remaining) next.add(code);
      return next;
    });
  }

  function selectAll() {
    const cap = remaining ?? available.length;
    setChecked(new Set(available.slice(0, cap).map((s) => s.studentCode)));
  }

  function addChecked() {
    for (const s of available) if (checked.has(s.studentCode)) onPick(s);
    setChecked(new Set());
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="form-group" style={{ marginBottom: 0, width: 100 }}>
          <label className="form-label">ระดับ</label>
          <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
            {levelOptions.length !== 1 && <option value="">เลือก</option>}
            {levelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
          <label className="form-label">ห้อง</label>
          <select className="form-select" value={room} onChange={(e) => setRoom(e.target.value)} disabled={!level || !rooms.length}>
            <option value="">เลือก</option>
            {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}

      {busy ? (
        <div className="sp-empty">กำลังโหลด…</div>
      ) : list && (
        available.length ? (
          <>
            <div className="row between" style={{ gap: 8 }}>
              <span className="text-sm muted">
                เลือกแล้ว {checked.size} คน{remaining !== undefined ? ` (เพิ่มได้อีก ${remaining})` : ""}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll} disabled={!available.length}>
                เลือกทั้งหมด
              </button>
            </div>
            <div className="sp-roomlist">
              {available.map((s) => {
                const on = checked.has(s.studentCode);
                const disabled = !on && capReached;
                return (
                  <label key={s.studentCode} className={`sp-roomrow ${disabled ? "disabled" : ""}`}>
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(s.studentCode)} />
                    <span>{s.name}</span>
                    <span className="sp-code muted text-xs">{s.studentCode}</span>
                  </label>
                );
              })}
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={!checked.size} onClick={addChecked}>
              เพิ่มที่เลือก ({checked.size})
            </button>
          </>
        ) : (
          <div className="sp-empty">
            {list.length ? "นักเรียนในห้องนี้ถูกเพิ่มครบแล้ว" : "ไม่พบนักเรียนในห้องนี้"}
          </div>
        )
      )}
    </div>
  );
}
