import { PublicHeader } from "@/components/PublicHeader";
import { RouteTransition } from "@/components/RouteTransition";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <PublicHeader />
      <main className="main-content"><RouteTransition>{children}</RouteTransition></main>
    </div>
  );
}
