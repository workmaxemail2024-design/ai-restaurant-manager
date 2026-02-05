import { PermissionFilteredSidebar } from "@/components/dashboard/PermissionFilteredSidebar";

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
      <PermissionFilteredSidebar />
      <main className="ml-64 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {(subtitle || description) && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle || description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
