import { cn } from "@/lib/utils";
import { MapPin, Users, TrendingUp, Clock } from "lucide-react";

interface LocationCardProps {
  name: string;
  address: string;
  status: "open" | "closed" | "busy";
  revenue: string;
  staff: number;
  waitTime: string;
  delay?: number;
}

export function LocationCard({ 
  name, 
  address, 
  status, 
  revenue, 
  staff, 
  waitTime,
  delay = 0 
}: LocationCardProps) {
  const statusColors = {
    open: "bg-success/20 text-success border-success/30",
    closed: "bg-muted text-muted-foreground border-border",
    busy: "bg-warning/20 text-warning border-warning/30",
  };

  const statusLabels = {
    open: "Open",
    closed: "Closed",
    busy: "Busy",
  };

  return (
    <div 
      className="group relative overflow-hidden rounded-xl bg-card border border-border p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">{name}</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" />
            <span>{address}</span>
          </div>
        </div>
        <span className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium border",
          statusColors[status]
        )}>
          {statusLabels[status]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs">Revenue</span>
          </div>
          <p className="font-semibold text-primary">{revenue}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs">Staff</span>
          </div>
          <p className="font-semibold">{staff}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs">Wait</span>
          </div>
          <p className="font-semibold">{waitTime}</p>
        </div>
      </div>
    </div>
  );
}
