"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Year = { id: number; yearBe: number; isActive: boolean };
export type SourceYear = {
  yearBe: number;
  title: string;
  isActiveAtSource: boolean;
  imported: boolean;
};

export function YearsManager({
  years,
  initialSource = null,
  initialSourceError = null,
}: {
  years: Year[];
  initialSource?: SourceYear[] | null;
  initialSourceError?: string | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(
    initialSourceError ? { type: "error", text: initialSourceError } : null
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<SourceYear[] | null>(initialSource);

  async function loadSource() {
    setLoading(true); setMsg(null);
    const res = await api.get<{ years: SourceYear[] }>("/api/admin/years");
    setLoading(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setSource(res.data.years);
  }

  async function importYear(yearBe: number) {
    setBusy(true); setMsg(null);
    const res = await api.post("/api/admin/years", { yearBe });
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    setMsg({ type: "success", text: `นำเข้าปีการศึกษา ${yearBe} แล้ว` });
    await loadSource();
    router.refresh();
  }

  async function activate(id: number) {
    setBusy(true); setMsg(null);
    const res = await api.post(`/api/admin/years/${id}/activate`);
    setBusy(false);
    if (!res.ok) return setMsg({ type: "error", text: res.error });
    router.refresh();
  }

  const available = (source ?? []).filter((y) => !y.imported);

  return (
    <>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card mb-4">
        <div className="row between mb-4">
          <div className="card-header" style={{ padding: 0, border: "none" }}>นำเข้าปีการศึกษาจาก Student API</div>
          <button className="btn btn-secondary btn-sm" onClick={loadSource} disabled={loading}>
            {loading ? "กำลังโหลด…" : source ? "โหลดใหม่" : "ซิงค์ปีการศึกษาจาก Student API"}
          </button>
        </div>
        {source && (
          available.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>ปีการศึกษา</th><th>สถานะที่ต้นทาง</th><th style={{ width: 120 }}></th></tr></thead>
                <tbody>
                  {available.map((y) => (
                    <tr key={y.yearBe}>
                      <td>{y.title || y.yearBe}</td>
                      <td>{y.isActiveAtSource ? <span className="badge badge-success">ปีปัจจุบัน</span> : <span className="badge">-</span>}</td>
                      <td className="num">
                        <button className="btn btn-primary btn-sm" onClick={() => importYear(y.yearBe)} disabled={busy}>นำเข้า</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center muted">นำเข้าครบทุกปีที่มีใน Student API แล้ว</div>
          )
        )}
        <div className="form-hint mt-2">ปีการศึกษาสร้างเองไม่ได้ — เลือกนำเข้าจาก Student API เท่านั้น</div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>ปีการศึกษา</th><th>สถานะ</th><th></th></tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id}>
                <td>{y.yearBe}</td>
                <td>{y.isActive ? <span className="badge badge-success">กำลังใช้งาน</span> : <span className="badge">ปิด</span>}</td>
                <td className="num">
                  {!y.isActive && <button className="btn btn-secondary btn-sm" onClick={() => activate(y.id)} disabled={busy}>เปิดใช้งาน</button>}
                </td>
              </tr>
            ))}
            {!years.length && <tr><td colSpan={3} className="text-center muted">ยังไม่มีปีการศึกษา — นำเข้าจาก Student API ด้านบน</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
