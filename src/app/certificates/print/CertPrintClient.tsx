"use client";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { fitCertTexts } from "@/lib/certFit";

/**
 * แถบเครื่องมือ + งานจัดหน้าฝั่งเบราว์เซอร์ของหน้าเกียรติบัตร
 *
 * หน้านี้ "ไม่เด้งหน้าต่างพิมพ์เอง" — ผู้ปกครองส่วนใหญ่เปิดมาเพื่อดูหรือแคปหน้าจอเฉย ๆ
 * การเด้งกล่องพิมพ์ใส่ทันทีที่เปิดทำให้งงว่าต้องกดอะไร ใครจะพิมพ์/บันทึก PDF กดปุ่มบนแถบเอา
 *
 * หลังฟอนต์ไทยโหลดเสร็จจะจัดหน้าสองชั้นตามลำดับนี้เท่านั้น
 *   1. ย่อข้อความที่ล้นกรอบในใบให้พอดี (fitCertTexts)
 *   2. ย่อ "ทั้งใบ" ให้พอดีจอ ทั้งกว้างและสูง (fitToScreen) — เฉพาะบนจอ ไม่แตะตอนพิมพ์
 *
 * ลำดับสำคัญ: fitCertTexts วัดความกว้างตัวอักษรจาก getBoundingClientRect
 * ถ้าย่อทั้งใบไปก่อน ค่าที่วัดได้จะเป็นพิกเซลหลังย่อ (บนมือถือเหลือ ~1 ใน 3)
 * ความละเอียดที่ใช้ตัดสินว่า "ล้นหรือยัง" หายไปด้วย — บางชื่อจะรอดมาแบบล้นเศษ ๆ ตอนพิมพ์
 */
export function CertPrintClient() {
  useEffect(() => {
    let cancelled = false;
    let fitted = false;

    /**
     * A4 บนจอกว้าง 297mm ≈ 1123px — มือถือกว้าง ~390px จึงเห็นแค่มุมซ้ายบนแล้วต้องเลื่อนหาเอง
     * ย่อด้วย transform: scale ไม่ใช่ลด pageWidth เพราะทุกพิกัดในใบผูกกับ --page-w เป็น mm
     * ที่พิมพ์ออกกระดาษจึงไม่ขยับสักจุด และข้อความยังเป็น DOM จริง ผู้ใช้ซูมสองนิ้วเข้าไปอ่านได้คมชัด
     *
     * ต้องดูทั้งกว้างและสูง ไม่ใช่ความกว้างอย่างเดียว: มือถือที่หมุนเป็นแนวนอนกว้าง ~840px ก็จริง
     * แต่สูงเหลือแค่ ~350px (แถบ URL กินไปอีก) ถ้าย่อตามความกว้างจะได้ใบสูง ~600px — โดนตัดครึ่งล่าง
     * ความสูงจออ่านจาก documentElement.clientHeight ไม่ใช่ visualViewport
     * — visualViewport หดตามตอนผู้ใช้ซูม จะกลายเป็นวงวน: ซูมเข้า → ใบถูกย่อลงอีก
     */
    const fitToScreen = () => {
      for (const page of Array.from(document.querySelectorAll<HTMLElement>(".cert-page"))) {
        const sheet = page.firstElementChild as HTMLElement | null;
        const root = page.parentElement;
        if (!sheet || !root) continue;
        // offsetWidth/Height ไม่สนใจ transform → อ่านได้ขนาดจริงของกระดาษเสมอ แม้ย่อค้างอยู่แล้ว
        const w = sheet.offsetWidth;
        const h = sheet.offsetHeight;
        if (!w || !h) continue;
        const cs = getComputedStyle(root);
        const availW = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (availW <= 0) continue;
        // สูงที่เหลือให้ใบ = ความสูงจอ ลบขอบบน-ล่าง ลบแถบเครื่องมือกับช่องไฟของมัน
        const bar = root.querySelector<HTMLElement>(".cert-toolbar");
        const barH = bar ? bar.getBoundingClientRect().height : 0;
        const gap = barH ? parseFloat(cs.rowGap) || 0 : 0;
        const viewH = document.documentElement.clientHeight || window.innerHeight;
        const availH = viewH - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - barH - gap;
        // ไม่ขยายเกินขนาดจริง (จอใหญ่เห็นเท่าเดิม) — ย่อได้อย่างเดียว
        // กันเล็กจนอ่านไม่ออกด้วย 0.15 เผื่อจอเตี้ยผิดปกติ (ซูมเข้าดูเองได้ ดีกว่าโดนตัด)
        const s = Math.max(0.15, Math.min(1, availW / w, availH > 0 ? availH / h : Infinity));
        page.style.setProperty("--cert-s", String(s));
        page.style.setProperty("--cert-w", `${w * s}px`);
        page.style.setProperty("--cert-h", `${h * s}px`);
      }
    };

    const layout = () => {
      if (cancelled || fitted) return;
      fitted = true;
      fitCertTexts(document);
      fitToScreen();
    };

    // เพดานกันค้างถ้าฟอนต์โหลดไม่ขึ้น + หน่วงขั้นต่ำเผื่อรูปพื้นหลัง
    const cap = window.setTimeout(layout, 3000);
    const minWait = new Promise<void>((r) => window.setTimeout(r, 300));
    Promise.all([document.fonts?.ready, minWait]).then(layout, layout);

    // หมุนจอ/เปลี่ยนขนาดหน้าต่างแล้วต้องพอดีใหม่ (ข้อความในใบไม่ต้องย่อซ้ำ ขนาดใบเป็น mm คงที่)
    // วัดซ้ำอีกทีที่ 300ms ด้วย: Safari บนมือถือยิง resize ตั้งแต่ยังหมุนไม่สุด
    // ค่าที่อ่านได้รอบแรกจึงเป็นขนาดของจอเก่า ต้องตามเก็บรอบสองไม่งั้นค้างเป็นขนาดผิด
    let raf = 0;
    let late = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitToScreen);
      window.clearTimeout(late);
      late = window.setTimeout(fitToScreen, 300);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      cancelled = true;
      window.clearTimeout(cap);
      window.clearTimeout(late);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return (
    <div className="cert-toolbar">
      {/* กล่องพิมพ์ของทุกเบราว์เซอร์มีตัวเลือก "บันทึกเป็น PDF" อยู่ในตัว จึงเป็นปุ่มเดียวจบทั้งสองงาน */}
      <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
        <Icon name="printer" size={16} /> พิมพ์ / บันทึกเป็น PDF
      </button>
      <span className="cert-zoom-hint">ย่อให้เห็นเต็มใบแล้ว — ซูมเข้าเพื่ออ่านรายละเอียด</span>
    </div>
  );
}
