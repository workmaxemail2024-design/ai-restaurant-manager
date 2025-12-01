import { Sparkles, TrendingUp, AlertCircle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Insight {
  type: "trend" | "alert" | "suggestion";
  title: string;
  description: string;
}

const insights: Insight[] = [
  {
    type: "trend",
    title: "Peak Hours Shifting",
    description: "Lunch rush is starting 30min earlier this week. Consider adjusting staff schedules.",
  },
  {
    type: "alert",
    title: "Low Stock Alert",
    description: "Chicken breast inventory at Downtown location will run out in 2 days.",
  },
  {
    type: "suggestion",
    title: "Menu Optimization",
    description: "Grilled Salmon has 45% higher margin than similar dishes. Feature it prominently.",
  },
];

const iconMap = {
  trend: TrendingUp,
  alert: AlertCircle,
  suggestion: Lightbulb,
};

const colorMap = {
  trend: "text-primary",
  alert: "text-warning",
  suggestion: "text-success",
};

export function AIInsightPanel() {
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden animate-fade-in" style={{ animationDelay: "400ms" }}>
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">AI Insights</h3>
            <p className="text-xs text-muted-foreground">Powered by machine learning</p>
          </div>
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {insights.map((insight, index) => {
          const Icon = iconMap[insight.type];
          return (
            <div 
              key={index} 
              className="p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/20 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 ${colorMap[insight.type]}`} />
                <div>
                  <h4 className="text-sm font-medium">{insight.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-border">
        <Button variant="ghost" className="w-full justify-center text-primary hover:text-primary hover:bg-primary/10">
          <Sparkles className="h-4 w-4 mr-2" />
          Ask AI Assistant
        </Button>
      </div>
    </div>
  );
}
