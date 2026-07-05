"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";

export function WithdrawButton({ entryId, disabled }: { entryId: number; disabled?: boolean }) {
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
        title={disabled ? "ปิดรับสมัครแล้ว" : undefined}>
        ยกเลิก
      </button>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
