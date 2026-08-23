import {
  AmbientLayer,
  AppFooter,
  AppTopbar,
} from "@/components/ResearchWorkspaceView";

export default function IdeasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <AmbientLayer />
      <AppTopbar />
      {children}
      <AppFooter />
    </div>
  );
}
