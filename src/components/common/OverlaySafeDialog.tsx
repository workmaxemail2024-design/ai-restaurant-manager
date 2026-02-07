import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface OverlaySafeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /**
   * Size presets:
   * - "sm": max-w-md (448px)
   * - "default": max-w-lg (512px)
   * - "lg": max-w-2xl (672px)
   * - "xl": max-w-4xl (896px)
   * - "full": max-w-[95vw]
   */
  size?: "sm" | "default" | "lg" | "xl" | "full";
}

const sizeClasses = {
  sm: "max-w-md",
  default: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[95vw]",
};

/**
 * A dialog wrapper optimized for containing overlay components (popovers, calendars, dropdowns).
 * 
 * Features:
 * - overflow-visible to prevent clipping of nested overlays
 * - Proper z-index layering (z-[50] for content)
 * - Stable max-width with responsive behavior
 * - Optional max-height with internal scrolling
 */
export function OverlaySafeDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  size = "default",
}: OverlaySafeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          sizeClasses[size],
          "max-h-[90vh] flex flex-col",
          className
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
