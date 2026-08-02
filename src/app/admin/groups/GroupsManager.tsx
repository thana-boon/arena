"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useConfirm } from "@/components/ConfirmDialog";

type G = { id: number; name: string; catalogNo: number | null };
type Cat = { groupNo: number; name: string };

export function GroupsManager({ groups, catalog }: { groups: G[]; catalog: Cat[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cat, setCat] = useState<Cat[]>(catalog);

  const usedNos = new Set(groups.map((g) => g.catalogNo).filter((n): n is number => n != null));

  async function sync() {
    setSyncing(true); setMsg(null);
    // ซิงค์หมวดต้องกวาดรายชื่อครูทุกหน้า — เผื่อเวลามากกว่าปกติ
    const res = await api.post<{ catalog: Cat[] }>("/api/admin/subject-groups/sync", undefined, { timeoutMs: 40_000 });
    setSyncing(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setCat(res.data.catalog);
    setMsg({ type: "success", text: `ซิงค์หมวดจาก Teacher API แล้ว (${res.data.catalog.length} หมวด)` });
    router.refresh();
  }

  async function add(catalogNo: number) {
    setBusy(true); setMsg(null);
    const res = await api.post("/api/admin/groups", { catalogNo });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }

  async function del(id: number) {
    const ok = await confirm({
      title: "นำหมวดวิชาออก",
      message: "ยืนยันนำหมวดวิชานี้ออกจากปีการศึกษานี้?",
      confirmText: "นำออก",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setMsg(null);
    const res = await api.del(`/api/admin/groups/${id}`);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }

  const available = cat.filter((c) => !usedNos.has(c.groupNo));

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card mb-4">
        <div className="table-wrap table-cards">
          <table className="table">
            <thead><tr><th>หมวดวิชาที่ใช้ในปีนี้</th><th style={{ width: 160 }}></th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td className="td-title">{g.name}{g.catalogNo == null && <span className="badge ml-2">สร้างเอง</span>}</td>
                  <td className="num td-actions">
                    <button className="btn btn-danger btn-sm" onClick={() => del(g.id)} disabled={busy}>นำออก</button>
                  </td>
                </tr>
              ))}
              {!groups.length && <tr><td colSpan={2} className="text-center muted">ยังไม่ได้เลือกหมวดวิชา — เพิ่มจากรายการด้านล่าง</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="row between mb-4">
          <div className="card-header" style={{ padding: 0, border: "none" }}>เพิ่มหมวดวิชาจาก Teacher API</div>
          <button className="btn btn-secondary btn-sm" onClick={sync} disabled={syncing}>
            {syncing ? "กำลังซิงค์…" : cat.length ? "ซิงค์ใหม่" : "ซิงค์รายการหมวดจาก Teacher API"}
          </button>
        </div>

        {!cat.length ? (
          <div className="text-center muted">กดปุ่ม “ซิงค์รายการหมวดจาก Teacher API” เพื่อดึงหมวดที่มีอยู่จริง</div>
        ) : (
          <div className="table-wrap table-cards">
            <table className="table">
              <thead><tr><th style={{ width: 80 }}>เลขหมวด</th><th>ชื่อหมวด</th><th style={{ width: 120 }}></th></tr></thead>
              <tbody>
                {available.map((c) => (
                  <tr key={c.groupNo}>
                    <td className="muted hide-sm">{c.groupNo}</td>
                    <td className="td-title">
                      {c.name || <span className="muted">(ยังไม่มีชื่อ)</span>}
                      <div className="only-sm text-xs muted">หมวดที่ {c.groupNo}</div>
                    </td>
                    <td className="num td-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => add(c.groupNo)} disabled={busy}>เพิ่ม</button>
                    </td>
                  </tr>
                ))}
                {!available.length && <tr><td colSpan={3} className="text-center muted">เพิ่มครบทุกหมวดแล้ว</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
