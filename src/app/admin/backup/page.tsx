import { requireAdmin } from "@/lib/auth/guards";
import { BackupRestore } from "./BackupRestore";

export const dynamic = "force-dynamic";

export default async function AdminBackupPage() {
  await requireAdmin();
  return <BackupRestore />;
}
