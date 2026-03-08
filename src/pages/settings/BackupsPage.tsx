import { PageLayout } from "@/components/common/PageLayout";
import { useBackups, SystemBackup } from "@/hooks/useBackups";
import { RequirePermission } from "@/components/RequirePermission";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Download, CheckCircle, XCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

function statusBadge(status: string) {
  switch (status) {
    case "success":
      return <Badge className="bg-emerald-600 dark:bg-emerald-500 text-primary-foreground"><CheckCircle className="h-3 w-3 mr-1" />Success</Badge>;
    case "failed":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "pending":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupsPage() {
  const { backups, isLoading, createBackup, lastSuccessful, isStale, hasRecentFailure } = useBackups();

  return (
    <RequirePermission resource="settings" action="admin">
      <PageLayout title="Backups" subtitle="Database backup management and monitoring">
        <div className="grid gap-6 md:grid-cols-3 mb-6">
          {/* Last backup card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Last Successful Backup</CardTitle>
            </CardHeader>
            <CardContent>
              {lastSuccessful ? (
                <div>
                  <p className="text-2xl font-bold">
                    {formatDistanceToNow(new Date(lastSuccessful.created_at), { addSuffix: true })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(lastSuccessful.created_at), "PPpp")}
                  </p>
                </div>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground">No backups yet</p>
              )}
            </CardContent>
          </Card>

          {/* Status card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isStale || hasRecentFailure ? (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-semibold">{hasRecentFailure ? "Last backup failed" : "No backup in 24h"}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-semibold">Healthy</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Retention card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Retention Policy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">14 days</p>
              <p className="text-xs text-muted-foreground">Daily backups retained automatically</p>
            </CardContent>
          </Card>
        </div>

        {/* Manual backup */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Backups</h2>
          <Button
            onClick={() => createBackup.mutate("manual")}
            disabled={createBackup.isPending}
          >
            {createBackup.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Create Backup Now</>
            )}
          </Button>
        </div>

        {/* Backups list */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading backups…
                    </TableCell>
                  </TableRow>
                ) : backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No backups yet. Create your first backup above.
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((b: SystemBackup) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        {format(new Date(b.created_at), "PPpp")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{b.backup_type}</Badge>
                      </TableCell>
                      <TableCell>{statusBadge(b.status)}</TableCell>
                      <TableCell>{formatBytes(b.size_bytes)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {b.error_message || b.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageLayout>
    </RequirePermission>
  );
}
