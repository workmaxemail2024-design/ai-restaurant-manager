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
      <main className="ml-64 p-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {(subtitle || description) && (
              <p className="text-muted-foreground">{subtitle || description}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
