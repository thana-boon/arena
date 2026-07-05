"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

/**
 * ดึงรายชื่อห้องของระดับชั้นที่เลือก (distinct จาก Student API)
 * คืน [] ถ้ายังไม่เลือกระดับ — ใช้เติม dropdown ห้องให้ครบทุกห้อง
 * (แทนการเดาห้องจากผลค้นหาที่ถูกตัดที่ 50 รายการ)
 */
export function useClassRooms(level: string): { rooms: string[]; loading: boolean } {
  const [rooms, setRooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!level) {
      setRooms([]);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .get<{ rooms: string[] }>(`/api/students/rooms?class_level=${encodeURIComponent(level)}`)
      .then((res) => {
        if (!alive) return;
        setRooms(res.ok ? res.data.rooms : []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [level]);
  return { rooms, loading };
}
