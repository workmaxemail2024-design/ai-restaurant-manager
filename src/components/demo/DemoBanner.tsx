import { AlertTriangle } from "lucide-react";
import { useIsDemoMode } from "@/hooks/useDemoMode";

export function DemoBanner() {
  const { data: isDemoMode } = useIsDemoMode();

  if (!isDemoMode) return null;

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
      <AlertTriangle className="h-4 w-4" />
      <span>Demo Mode — Data shown is for demonstration purposes only</span>
    </div>
  );
}
