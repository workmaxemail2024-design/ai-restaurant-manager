import { useState } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { RequirePermission } from '@/components/RequirePermission';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Check, Trash2, AlertTriangle, Info, AlertCircle, CheckCheck } from 'lucide-react';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  Notification,
} from '@/hooks/useNotifications';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

const typeIcons = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  action_required: AlertCircle,
};

const typeColors = {
  info: 'text-blue-500 bg-blue-500/10',
  warning: 'text-yellow-500 bg-yellow-500/10',
  error: 'text-red-500 bg-red-500/10',
  action_required: 'text-orange-500 bg-orange-500/10',
};

const typeBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  info: 'secondary',
  warning: 'outline',
  error: 'destructive',
  action_required: 'default',
};

function NotificationCard({ notification }: { notification: Notification }) {
  const markRead = useMarkNotificationRead();
  const deleteNotification = useDeleteNotification();
  const Icon = typeIcons[notification.type] || Info;
  const colorClass = typeColors[notification.type] || 'text-muted-foreground bg-muted';

  return (
    <Card className={cn(!notification.is_read && 'border-primary/30 bg-primary/5')}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className={cn('p-2 rounded-lg', colorClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={cn('font-semibold', !notification.is_read && 'text-foreground')}>
                    {notification.title}
                  </h3>
                  <Badge variant={typeBadgeVariants[notification.type] || 'secondary'}>
                    {notification.type.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {notification.message}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  {format(new Date(notification.created_at), 'PPp')} ({formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })})
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!notification.is_read && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => markRead.mutate(notification.id)}
                    disabled={markRead.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteNotification.mutate(notification.id)}
                  disabled={deleteNotification.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { data: notifications = [], isLoading } = useNotifications(100);
  const markAllRead = useMarkAllNotificationsRead();

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <RequirePermission resource="dashboard" action="view">
      <PageLayout 
        title="Notifications" 
        subtitle="Stay updated with system alerts and messages"
      >
        <div className="flex justify-between items-center mb-6">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
            <TabsList>
              <TabsTrigger value="all">
                All ({notifications.length})
              </TabsTrigger>
              <TabsTrigger value="unread">
                Unread ({unreadCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {unreadCount > 0 && (
            <Button variant="outline" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Bell className="h-8 w-8 animate-pulse text-muted-foreground" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </h3>
              <p className="text-muted-foreground text-center">
                {filter === 'unread' 
                  ? "You're all caught up!" 
                  : 'System notifications will appear here'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} />
            ))}
          </div>
        )}
      </PageLayout>
    </RequirePermission>
  );
}
