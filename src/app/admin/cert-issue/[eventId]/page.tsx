import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getActiveYear } from "@/lib/queries";
import { getCertIssueEvent } from "@/lib/certIssuing";
import { CertIssuePanel } from "@/components/certificate/CertIssuePanel";

export const dynamic = "force-dynamic";

export default async function AdminCertIssueEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await requireAdmin();
  const year = await getActiveYear();
  if (!year) notFound();

  const detail = await getCertIssueEvent(session, year.id, Number((await params).eventId));
  if (!detail) notFound();

  return (
    <CertIssuePanel eventName={detail.event.name} rows={detail.rows} backHref="/admin/cert-issue" />
  );
}
