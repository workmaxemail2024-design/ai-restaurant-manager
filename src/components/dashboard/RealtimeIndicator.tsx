import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RealtimeIndicatorProps {
  isConnected: boolean;
  className?: string;
}

export function RealtimeIndicator({ isConnected, className }: RealtimeIndicatorProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
          isConnected 
            ? "bg-success/10 text-success border border-success/20" 
            : "bg-muted text-muted-foreground border border-border",
          className
        )}>
          {isConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <Wifi className="h-3 w-3" />
              <span className="hidden sm:inline">Live</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-muted-foreground"></span>
              <WifiOff className="h-3 w-3" />
              <span className="hidden sm:inline">Offline</span>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isConnected 
          ? "Connected to real-time updates" 
          : "Real-time updates disconnected"}
      </TooltipContent>
    </Tooltip>
  );
}
