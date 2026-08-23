import {
  AmbientLayer,
  AppFooter,
  AppTopbar,
} from "@/components/ResearchWorkspaceView";
import { ScrollToTopOnPathChange } from "@/components/ScrollToTopOnPathChange";

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <AmbientLayer />
      <AppTopbar />
      <ScrollToTopOnPathChange />
      {children}
      <AppFooter />
    </div>
  );
}
