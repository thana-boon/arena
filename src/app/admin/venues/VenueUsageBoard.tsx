"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatThaiDate, hhmm } from "@/lib/domain";

/**
 * ผังการใช้ห้องของงานหนึ่ง — แยกตามอาคาร แล้วโชว์ไฟเขียว/แดงรายห้อง
 *
 * มีเพราะตอนวางตารางแข่ง คนจัดต้องรู้ว่า "ห้องไหนยังว่าง" ก่อนจะยัดรายการเพิ่ม
 * ซึ่งเดิมต้องไล่เปิดทีละรายการดูว่าใช้ห้องอะไร (เอกสาร "สรุปการใช้ห้อง" ตอบได้แต่ห้องที่ถูกใช้แล้ว
 * ไม่เคยบอกห้องที่ยังว่าง เพราะมันไล่จากรายการ ไม่ได้ไล่จากรายชื่อห้องทั้งหมด)
 */

export type UsageVenue = { id: number; name: string; building: string; note: string };
export type UsageCompetition = {
  id: number;
  eventId: number | null;
  name: string;
  groupName: string;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  venueIds: number[];
};

const ALL_SLOTS = "__all__";
const NO_BUILDING = "ไม่ระบุอาคาร";
/** จำนวนรายการที่โชว์ในการ์ดห้องก่อนต้องกด "ดูทั้งหมด" — กันการ์ดยืดจนผังเสียรูป */
const USES_PREVIEW = 3;

/** คีย์ของ "ช่วงเวลาแข่ง" หนึ่งช่อง = วันเดียวกัน + เวลาเริ่ม-จบเดียวกัน */
function slotKey(c: UsageCompetition): string {
  return `${c.eventDate ?? ""}|${c.startTime ?? ""}|${c.endTime ?? ""}`;
}

function timeLabel(c: { startTime: string | null; endTime: string | null }): string {
  return c.startTime ? `${hhmm(c.startTime)}–${hhmm(c.endTime)} น.` : "";
}

function slotLabel(c: UsageCompetition): string {
  return [formatThaiDate(c.eventDate), timeLabel(c)].filter(Boolean).join(" ") || "ไม่ระบุวัน–เวลา";
}

/** เวลาคาบเกี่ยวกันไหม — วันเดียวกันและช่วงเวลาซ้อนทับ (ต้องมีเวลาครบทั้งคู่ถึงจะตัดสินได้) */
function overlaps(a: UsageCompetition, b: UsageCompetition): boolean {
  if (!a.eventDate || a.eventDate !== b.eventDate) return false;
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false;
  return a.startTime < b.endTime && a.endTime > b.startTime;
}

export function VenueUsageBoard({
  venues,
  events,
  competitions,
  defaultEventId = null,
}: {
  venues: UsageVenue[];
  events: { id: number; name: string }[];
  competitions: UsageCompetition[];
  defaultEventId?: number | null;
}) {
  const [eventId, setEventId] = useState<number | null>(
    (defaultEventId != null && events.some((e) => e.id === defaultEventId) ? defaultEventId : events[0]?.id) ?? null
  );
  const [slot, setSlot] = useState<string>(ALL_SLOTS);
  const [q, setQ] = useState("");

  const inEvent = useMemo(() => competitions.filter((c) => c.eventId === eventId), [competitions, eventId]);

  // ช่วงเวลาที่มีอยู่จริงในงานนี้ (ไม่เอาช่วงจากงานอื่นมาให้เลือก — จะได้ไม่มีตัวเลือกที่กดแล้วว่างทั้งผัง)
  const slots = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of inEvent) if (c.eventDate || c.startTime) seen.set(slotKey(c), slotLabel(c));
    return [...seen.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [inEvent]);

  // เลือกช่วงเวลาไว้แล้วสลับไปงานที่ไม่มีช่วงนั้น → ถือว่าดูทั้งงาน (ไม่ใช่ผังว่างเปล่าที่ดูเหมือนข้อมูลหาย)
  const activeSlot = slot !== ALL_SLOTS && slots.some((s) => s.key === slot) ? slot : ALL_SLOTS;
  const shown = useMemo(
    () => (activeSlot === ALL_SLOTS ? inEvent : inEvent.filter((c) => slotKey(c) === activeSlot)),
    [inEvent, activeSlot]
  );

  // ห้อง → รายการที่ใช้ห้องนั้น (ตามช่วงเวลาที่กรองไว้)
  const usageByVenue = useMemo(() => {
    const map = new Map<number, UsageCompetition[]>();
    for (const c of shown) {
      for (const vid of c.venueIds) {
        const list = map.get(vid);
        if (list) list.push(c);
        else map.set(vid, [c]);
      }
    }
    return map;
  }, [shown]);

  const unassigned = useMemo(() => shown.filter((c) => !c.venueIds.length), [shown]);

  const needle = q.trim().toLowerCase();
  const buildings = useMemo(() => {
    const map = new Map<string, UsageVenue[]>();
    for (const v of venues) {
      if (needle && !`${v.name} ${v.building} ${v.note}`.toLowerCase().includes(needle)) continue;
      const key = v.building.trim() || NO_BUILDING;
      const list = map.get(key);
      if (list) list.push(v);
      else map.set(key, [v]);
    }
    return [...map.entries()]
      .map(([name, rooms]) => ({
        name,
        // "ห้อง 10" ต้องมาหลัง "ห้อง 9" — เรียงแบบรู้จักตัวเลข ไม่ใช่เรียงตามตัวอักษรล้วน
        rooms: rooms.sort((a, b) => a.name.localeCompare(b.name, "th", { numeric: true })),
      }))
      // อาคารที่ไม่ระบุชื่อไปท้ายสุดเสมอ
      .sort((a, b) =>
        a.name === NO_BUILDING ? 1 : b.name === NO_BUILDING ? -1 : a.name.localeCompare(b.name, "th", { numeric: true })
      );
  }, [venues, needle]);

  const shownVenues = useMemo(() => buildings.flatMap((b) => b.rooms), [buildings]);
  const busyCount = shownVenues.filter((v) => (usageByVenue.get(v.id)?.length ?? 0) > 0).length;
  const freeCount = shownVenues.length - busyCount;

  if (!venues.length) {
    return (
      <div className="alert alert-info">
        ยังไม่มีสถานที่ในระบบ — เพิ่มห้องในแท็บ “จัดการสถานที่” ก่อน แล้วผังนี้จะขึ้นให้เอง
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card stack">
        <div className="form-row">
          <label className="field" style={{ flex: "2 1 260px" }}>
            <span>งาน</span>
            <select value={eventId ?? ""} onChange={(e) => setEventId(Number(e.target.value) || null)}>
              {!events.length && <option value="">— ยังไม่มีงานในปีนี้ —</option>}
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "1 1 200px" }}>
            <span>ค้นหาห้อง</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อห้อง / อาคาร" />
          </label>
        </div>

        {slots.length > 1 && (
          <div>
            <label className="form-label">ช่วงเวลา</label>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <button
                className={`btn btn-sm ${activeSlot === ALL_SLOTS ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setSlot(ALL_SLOTS)}
              >
                ทั้งงาน
              </button>
              {slots.map((s) => (
                <button
                  key={s.key}
                  className={`btn btn-sm ${activeSlot === s.key ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSlot(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="form-hint">
              เลือกช่วงเวลาแล้ว ไฟเขียว/แดงจะหมายถึง “ว่าง/ไม่ว่างเฉพาะช่วงนั้น” — ห้องที่ใช้ตอนเช้าจะกลับมาว่างในรอบบ่าย
            </span>
          </div>
        )}

        <div className="venue-legend">
          <span className="venue-legend-item">
            <i className="venue-dot free" aria-hidden="true" /> ว่าง {freeCount} ห้อง
          </span>
          <span className="venue-legend-item">
            <i className="venue-dot busy" aria-hidden="true" /> ถูกใช้แล้ว {busyCount} ห้อง
          </span>
          <span className="venue-legend-item muted">
            {activeSlot === ALL_SLOTS ? "นับรวมทุกช่วงเวลาในงาน" : "เฉพาะช่วงที่เลือก"} · {shown.length} รายการ
          </span>
        </div>
      </div>

      {!events.length && <div className="alert alert-info">ยังไม่มีงานในปีการศึกษานี้ — สร้างงานก่อนถึงจะมีผังการใช้ห้อง</div>}

      {!shownVenues.length && needle && (
        <div className="alert alert-info">ไม่พบห้องที่ตรงกับ “{q}”</div>
      )}

      {buildings.map((b) => {
        const busy = b.rooms.filter((v) => (usageByVenue.get(v.id)?.length ?? 0) > 0).length;
        return (
          <section key={b.name} className="venue-building">
            <div className="venue-building-head">
              <span className="venue-building-icon"><Icon name="pin" size={18} /></span>
              <h2 className="venue-building-name">{b.name}</h2>
              <span className="venue-building-count">
                ใช้แล้ว {busy} / {b.rooms.length} ห้อง
              </span>
              <span className="venue-building-bar" aria-hidden="true">
                <i style={{ width: `${b.rooms.length ? (busy / b.rooms.length) * 100 : 0}%` }} />
              </span>
            </div>
            <div className="venue-grid">
              {b.rooms.map((v) => (
                <VenueTile key={v.id} venue={v} uses={usageByVenue.get(v.id) ?? []} />
              ))}
            </div>
          </section>
        );
      })}

      {unassigned.length > 0 && (
        <div className="card">
          <div className="row" style={{ gap: 8, marginBottom: "var(--space-3)" }}>
            <Icon name="warning" size={18} />
            <strong>ยังไม่ระบุห้อง ({unassigned.length} รายการ)</strong>
          </div>
          <p className="form-hint" style={{ marginBottom: "var(--space-3)" }}>
            รายการเหล่านี้ไม่ได้เลือกห้องไว้ จึงไม่ปรากฏในผังด้านบน — แก้ได้ที่หน้ารายการแข่งขัน
          </p>
          <ul className="venue-unassigned">
            {unassigned.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <span className="muted text-sm">{slotLabel(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VenueTile({ venue, uses }: { venue: UsageVenue; uses: UsageCompetition[] }) {
  const [expanded, setExpanded] = useState(false);
  const busy = uses.length > 0;
  // เวลาซ้อนกันในห้องเดียว = จองชนกัน ต้องเห็นตั้งแต่ในผัง ไม่ใช่ไปเจอเอาหน้างาน
  const clash = useMemo(
    () => uses.some((a, i) => uses.some((b, j) => j > i && overlaps(a, b))),
    [uses]
  );
  const visible = expanded ? uses : uses.slice(0, USES_PREVIEW);
  const hidden = uses.length - visible.length;

  return (
    <article className={`venue-tile ${busy ? "busy" : "free"}`}>
      <div className="venue-tile-head">
        <i className={`venue-dot ${busy ? "busy" : "free"}`} aria-hidden="true" />
        <span className="venue-tile-name">{venue.name}</span>
        <span className="venue-tile-state">{busy ? `${uses.length} รายการ` : "ว่าง"}</span>
      </div>
      {venue.note && <div className="venue-tile-note">{venue.note}</div>}
      {clash && (
        <div className="venue-tile-clash">
          <Icon name="warning" size={14} /> เวลาซ้อนกัน
        </div>
      )}
      {busy ? (
        <ul className="venue-tile-uses">
          {visible.map((c) => (
            <li key={c.id}>
              <span className="venue-use-time">{timeLabel(c) || formatThaiDate(c.eventDate) || "ไม่ระบุเวลา"}</span>
              <span className="venue-use-name">{c.name}</span>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <button className="venue-use-more" onClick={() => setExpanded(true)}>
                + อีก {hidden} รายการ
              </button>
            </li>
          )}
        </ul>
      ) : (
        <div className="venue-tile-empty">ยังไม่มีรายการใช้ห้องนี้</div>
      )}
    </article>
  );
}
