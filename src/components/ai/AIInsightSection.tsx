import { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIInsightSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3;
}

export function AIInsightSection({ 
  title, 
  description, 
  children, 
  className,
  columns = 2 
}: AIInsightSectionProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className={cn("grid gap-4", gridCols[columns])}>
        {children}
      </div>
    </section>
  );
}
