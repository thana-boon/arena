"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";

export function WithdrawButton({
  entryId,
  disabled,
  disabledReason,
}: {
  entryId: number;
  disabled?: boolean;
  /** เหตุผลที่กดไม่ได้ — ขึ้นใต้ปุ่มให้อ่านเจอบนมือถือด้วย (tooltip อย่างเดียวแตะไม่ติด) */
  disabledReason?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function withdraw() {
    const ok = await confirm({
      title: "ยกเลิกการลงทะเบียน",
      message: "ยืนยันยกเลิกการลงทะเบียนรายการนี้?",
      confirmText: "ยกเลิกการลงทะเบียน",
      cancelText: "ไม่",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setErr("");
    const res = await api.del(`/api/registrations/${entryId}`);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    router.refresh();
  }

  return (
    <div style={{ textAlign: "right" }}>
      <button className="btn btn-ghost btn-sm" onClick={withdraw} disabled={busy || disabled}
        title={disabled ? disabledReason ?? "ปิดรับสมัครแล้ว" : undefined}>
        ยกเลิก
      </button>
      {disabled && disabledReason && (
        <div className="text-xs muted" style={{ maxWidth: 180 }}>{disabledReason}</div>
      )}
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
