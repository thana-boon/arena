import { getActiveYearWithSettings } from "@/lib/queries";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export default async function SettingsPage() {
  const { year, setting } = await getActiveYearWithSettings();
  if (!year || !setting) {
    return <div className="alert alert-warning">ยังไม่มีปีการศึกษาที่เปิดใช้งาน โปรดเปิดปีการศึกษาก่อน</div>;
  }
  return (
    <div className="stack">
      <div className="page-header">
        <h1>ตั้งค่าการรับสมัคร</h1>
        <div className="subtitle">ปีการศึกษา {year.yearBe}</div>
      </div>
      <SettingsForm
        initial={{
          maxEntriesPerStudent: setting.maxEntriesPerStudent,
          registrationOpen: setting.registrationOpen,
          regStart: toLocalInput(setting.regStart),
          regEnd: toLocalInput(setting.regEnd),
          medalGoldPct: setting.medalGoldPct,
          medalSilverPct: setting.medalSilverPct,
          medalBronzePct: setting.medalBronzePct,
        }}
      />
    </div>
  );
}
