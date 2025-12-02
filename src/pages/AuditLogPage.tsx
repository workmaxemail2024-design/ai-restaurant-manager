import { useState } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { RequirePermission } from '@/components/RequirePermission';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Eye, Filter } from 'lucide-react';
import { useAuditLogs, EVENT_TYPES, AuditLog } from '@/hooks/useAuditLogs';
import { format } from 'date-fns';

const eventTypeLabels: Record<string, string> = {
  automation_run: 'Automation Run',
  ai_action: 'AI Action',
  pos_sync: 'POS Sync',
  staff_schedule_change: 'Staff Schedule',
  menu_price_change: 'Menu Price',
  inventory_correction: 'Inventory',
  role_change: 'Role Change',
  rule_created: 'Rule Created',
  rule_updated: 'Rule Updated',
  rule_deleted: 'Rule Deleted',
  purchase_order_created: 'Purchase Order',
  notification_sent: 'Notification',
};

const eventTypeBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  automation_run: 'default',
  ai_action: 'secondary',
  pos_sync: 'outline',
  staff_schedule_change: 'outline',
  menu_price_change: 'secondary',
  inventory_correction: 'outline',
  role_change: 'destructive',
  rule_created: 'default',
  rule_updated: 'secondary',
  rule_deleted: 'destructive',
  purchase_order_created: 'default',
  notification_sent: 'outline',
};

function AuditLogDetail({ log }: { log: AuditLog }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit Log Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Event Type</Label>
              <p className="font-medium">{eventTypeLabels[log.event_type] || log.event_type}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Timestamp</Label>
              <p className="font-medium">{format(new Date(log.created_at), 'PPpp')}</p>
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground">Description</Label>
            <p className="font-medium">{log.description}</p>
          </div>
          {log.user_id && (
            <div>
              <Label className="text-muted-foreground">User ID</Label>
              <p className="font-mono text-sm">{log.user_id}</p>
            </div>
          )}
          {Object.keys(log.data).length > 0 && (
            <div>
              <Label className="text-muted-foreground">Additional Data</Label>
              <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto text-xs">
                {JSON.stringify(log.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AuditLogPage() {
  const [eventType, setEventType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const { data: logs = [], isLoading } = useAuditLogs({
    eventType: eventType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const clearFilters = () => {
    setEventType('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <RequirePermission resource="settings" action="view">
      <PageLayout 
        title="Audit Log" 
        subtitle="Track all system activities and changes"
      >
        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs text-muted-foreground">Event Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All events" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All events</SelectItem>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {eventTypeLabels[type] || type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <FileText className="h-8 w-8 animate-pulse text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No audit logs found</h3>
              <p className="text-muted-foreground text-center">
                {eventType || startDate || endDate 
                  ? 'Try adjusting your filters' 
                  : 'System activities will be logged here'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="max-w-md">Description</TableHead>
                    <TableHead className="w-[80px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created_at), 'PP p')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={eventTypeBadgeVariants[log.event_type] || 'secondary'}>
                          {eventTypeLabels[log.event_type] || log.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {log.description}
                      </TableCell>
                      <TableCell>
                        <AuditLogDetail log={log} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Showing {logs.length} entries
        </p>
      </PageLayout>
    </RequirePermission>
  );
}
