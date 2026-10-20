"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";

/**
 * ปุ่มสลับโหมดของผู้ดูแลระบบ: ใช้งานแบบครูธรรมดา ⇄ กลับเป็นผู้ดูแลระบบ
 * (โชว์เฉพาะคนที่บทบาทจริงเป็น admin — AppShell เป็นคนตัดสิน)
 * @param asTeacher ตอนนี้อยู่ในโหมดครูอยู่หรือไม่
 * @param variant "menu" = แถวในเมนูผู้ใช้ · "button" = ปุ่มเล็ก (แถบแจ้งเตือน/แผ่นเมนูมือถือ)
 */
export function ViewAsToggle({ asTeacher, variant = "button" }: { asTeacher: boolean; variant?: "button" | "menu" }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const label = asTeacher ? "กลับเป็นผู้ดูแลระบบ" : "ใช้งานแบบครูทั่วไป";

  async function toggle() {
    setLoading(true);
    const res = await api.post<{ redirect: string }>("/api/auth/view-as", { mode: asTeacher ? "admin" : "teacher" });
    if (!res.ok) {
      setLoading(false);
      toast(res.error, "error");
      return;
    }
    // เมนู/เลย์เอาต์คนละชุดกันทั้งหมด — ให้ server render ใหม่ตามบทบาทที่เพิ่งสลับ
    router.push(res.data.redirect);
    router.refresh();
  }

  if (variant === "menu") {
    return (
      <button type="button" className="um-item" role="menuitem" onClick={toggle} disabled={loading}>
        <Icon name={asTeacher ? "settings" : "user"} size={18} />
        <span>{loading ? "กำลังสลับ..." : label}</span>
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={toggle} disabled={loading}>
      {loading ? "กำลังสลับ..." : label}
    </button>
  );
}
