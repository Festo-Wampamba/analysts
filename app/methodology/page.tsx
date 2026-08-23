import {
  AmbientLayer,
  AppFooter,
  AppTopbar,
} from "@/components/ResearchWorkspaceView";
import { MethodologyAndCosts } from "@/components/MethodologyAndCosts";

export const dynamic = "force-dynamic";

export default function MethodologyPage() {
  return <div className="app-shell"><AmbientLayer /><AppTopbar /><MethodologyAndCosts /><AppFooter /></div>;
}
