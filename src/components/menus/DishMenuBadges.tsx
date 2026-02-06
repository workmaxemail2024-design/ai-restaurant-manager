import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock } from "lucide-react";
import { useDishMenus } from "@/hooks/useMenus";
import { cn } from "@/lib/utils";

interface DishMenuBadgesProps {
  dishId: string;
  className?: string;
  maxShow?: number;
}

export function DishMenuBadges({ dishId, className, maxShow = 2 }: DishMenuBadgesProps) {
  const { data: dishMenus = [], isLoading } = useDishMenus(dishId);
  
  if (isLoading || dishMenus.length === 0) {
    return null;
  }
  
  const activeMenus = dishMenus.filter(dm => dm.menus?.status === "active");
  
  if (activeMenus.length === 0) {
    return null;
  }
  
  const visibleMenus = activeMenus.slice(0, maxShow);
  const remainingCount = activeMenus.length - maxShow;
  
  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {visibleMenus.map(dm => (
        <Tooltip key={dm.id}>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs gap-1 h-5 px-1.5">
              <Clock className="h-3 w-3" />
              {dm.menus?.name}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{dm.menus?.name}</p>
            <p className="text-xs text-muted-foreground">
              {dm.menus?.start_time?.slice(0, 5)} – {dm.menus?.end_time?.slice(0, 5)}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              +{remainingCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{remainingCount} more menu{remainingCount > 1 ? "s" : ""}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
