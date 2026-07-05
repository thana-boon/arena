"use client";
import { usePathname } from "next/navigation";

/**
 * ห่อเนื้อหาหลักให้ fade + เลื่อนขึ้นเล็กน้อยทุกครั้งที่เปลี่ยนหน้า
 * (remount ด้วย key = pathname เพื่อให้ animation เล่นซ้ำ)
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="route-fade">
      {children}
    </div>
  );
}
