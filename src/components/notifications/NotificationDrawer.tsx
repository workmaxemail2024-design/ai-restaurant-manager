import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2, AlertCircle, Info, AlertTriangle, CheckCircle } from "lucide-react";
import { useNotifications, useMarkNotificationRead, useDeleteNotification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const typeIcons = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
};

const typeColors = {
  info: "text-blue-500",
  warning: "text-yellow-500",
  error: "text-destructive",
  success: "text-green-500",
};

export function NotificationDrawer() {
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const deleteNotification = useDeleteNotification();

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkRead = (id: string) => {
    markRead.mutate(id);
  };

  const handleDelete = (id: string) => {
    deleteNotification.mutate(id);
  };

  const handleMarkAllRead = () => {
    notifications.filter(n => !n.is_read).forEach(n => {
      markRead.mutate(n.id);
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs animate-scale-in"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </SheetTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                <Check className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-4 opacity-20" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const Icon = typeIcons[notification.type as keyof typeof typeIcons] || Info;
                const colorClass = typeColors[notification.type as keyof typeof typeColors] || "text-muted-foreground";
                
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-3 rounded-lg border transition-all duration-200 hover:bg-muted/50",
                      !notification.is_read && "bg-primary/5 border-primary/20"
                    )}
                  >
                    <div className="flex gap-3">
                      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", colorClass)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={cn(
                            "text-sm font-medium truncate",
                            !notification.is_read && "font-semibold"
                          )}>
                            {notification.title}
                          </h4>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex gap-2 mt-2">
                          {!notification.is_read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleMarkRead(notification.id)}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Mark read
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleDelete(notification.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
