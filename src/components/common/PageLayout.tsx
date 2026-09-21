import { PermissionFilteredSidebar } from "@/components/dashboard/PermissionFilteredSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

interface PageLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageLayout({ children, title, subtitle, description, action }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none" />
      <PermissionFilteredSidebar className="hidden lg:flex" />
      <main className="p-4 sm:p-6 lg:ml-64">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 lg:hidden" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-none p-0">
                <PermissionFilteredSidebar />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {(subtitle || description) && (
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle || description}</p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
