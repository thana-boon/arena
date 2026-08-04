import { requireStaff } from "@/lib/auth/guards";
import { loadCompetitionSheet } from "@/lib/competitionSheet";
import { CompetitionSheet, COMP_DOC_LABEL, isCompDocType, type CompDocType } from "@/components/competition/CompetitionSheet";
import { PrintControls } from "@/components/PrintControls";

export const dynamic = "force-dynamic";

/**
 * หน้าเอกสารของรายการแข่งขันสำหรับพิมพ์ (เปิดในแท็บใหม่จากปุ่ม Export)
 * อยู่นอก layout ของ /teacher และ /admin เพื่อให้เห็นแต่กระดาษ แล้วเด้งหน้าต่างพิมพ์เอง
 */
export default async function CompetitionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const session = await requireStaff();
  const id = Number((await params).id);
  const sp = await searchParams;
  const doc: CompDocType = isCompDocType(sp.doc) ? sp.doc : "roster";

  const res = await loadCompetitionSheet(id, session);
  if (!res.ok) return <div style={{ padding: 40 }}>{res.error}</div>;

  return (
    <div className="report-print-root">
      <PrintControls />
      <div className="report-paper">
        <CompetitionSheet doc={doc} {...res.data} />
      </div>
    </div>
  );
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const sp = await searchParams;
  return { title: COMP_DOC_LABEL[isCompDocType(sp.doc) ? sp.doc : "roster"] };
}
