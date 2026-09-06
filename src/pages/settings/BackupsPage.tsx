import { PageLayout } from "@/components/common/PageLayout";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Database, ShieldCheck, Info, Loader2 } from "lucide-react";

export default function BackupsPage() {
  const { hasFullAccess, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasFullAccess()) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-muted-foreground text-lg mb-2">Access Denied</div>
        <p className="text-sm text-muted-foreground/70">
          Backup and recovery administration is restricted to the account owner.
        </p>
      </div>
    );
  }

  return (
    <PageLayout
      title="Backup & Recovery"
      subtitle="How your restaurant's data is backed up and restored."
    >
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertTitle>Recovery is handled outside this application</AlertTitle>
        <AlertDescription>
          RestaurantAI does not create or store its own backups. Database recovery is
          performed exclusively through the managed Supabase project backups for this
          restaurant. No backup or restore action can be triggered from this page.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-muted-foreground" />
              Where backups live
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The full database — sales, labour, inventory, documents metadata and
              settings — is backed up by the Supabase platform that hosts this project.
            </p>
            <p>
              Recovery is performed by the project owner from the Supabase dashboard
              under <span className="font-medium text-foreground">Database → Backups</span>,
              using a daily physical backup or Point-in-Time Recovery where enabled.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Who can recover data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Only the account owner with access to the Supabase project can restore
              data. Managers and staff have no restore capability, in this application
              or elsewhere.
            </p>
            <p>
              If data loss is suspected, stop entering new data and contact the owner
              immediately — restoring to an earlier point discards changes made after
              that point.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Before relying on recovery</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc pl-5 space-y-1">
            <li>Confirm the Supabase project plan includes daily backups, and enable Point-in-Time Recovery for finer-grained recovery.</li>
            <li>Perform a test restore into a scratch project so the recovery path is proven, not assumed.</li>
            <li>Note that Captiva POS remains the independent source of truth for sales and can be re-imported for any affected day.</li>
          </ul>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
