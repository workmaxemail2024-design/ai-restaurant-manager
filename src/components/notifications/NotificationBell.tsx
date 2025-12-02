import { useState } from 'react';
import { Bell, Check, CheckCheck, X, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead, Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const typeIcons = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  action_required: AlertCircle,
};

const typeColors = {
  info: 'text-blue-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
  action_required: 'text-orange-500',
};

function NotificationItem({ notification, onMarkRead }: { notification: Notification; onMarkRead: (id: string) => void }) {
  const Icon = typeIcons[notification.type] || Info;
  const colorClass = typeColors[notification.type] || 'text-muted-foreground';

  return (
    <div
      className={cn(
        'flex gap-3 p-3 border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer',
        !notification.is_read && 'bg-primary/5'
      )}
      onClick={() => !notification.is_read && onMarkRead(notification.id)}
    >
      <div className={cn('mt-0.5', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium truncate', !notification.is_read && 'text-foreground')}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: notifications = [] } = useNotifications(15);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleMarkRead = (id: string) => {
    markRead.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('/notifications');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={handleMarkRead}
              />
            ))
          )}
        </ScrollArea>

        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={handleViewAll}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
