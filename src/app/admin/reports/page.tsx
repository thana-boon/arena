import { requireAdmin } from "@/lib/auth/guards";
import { getReportBundles } from "@/lib/reportBundle";
import { ReportsBuilder } from "./ReportsBuilder";

export const dynamic = "force-dynamic";

export default async function AdminReportsIndexPage() {
  await requireAdmin();
  const { yearBe, bundles } = await getReportBundles();
  return <ReportsBuilder yearBe={yearBe} bundles={bundles} />;
}
