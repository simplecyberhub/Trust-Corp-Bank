import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, ShieldAlert, CreditCard, Activity } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export function Notifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey() } });
  
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ notificationId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "All caught up!" });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'security': return <ShieldAlert size={20} className="text-orange-500" />;
      case 'transaction': return <Activity size={20} className="text-primary" />;
      case 'kyc': return <CheckCheck size={20} className="text-green-500" />;
      case 'system': return <Bell size={20} className="text-blue-400" />;
      case 'promotion': return <CreditCard size={20} className="text-purple-400" />;
      default: return <Bell size={20} className="text-muted-foreground" />;
    }
  };

  return (
    <div className="px-6 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Notifications</h1>
        {notifications?.some(n => !n.read) && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="text-primary text-xs">
            Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex gap-4 p-4 bg-card rounded-xl border border-border">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1">
                <Skeleton className="w-32 h-4 mb-2" />
                <Skeleton className="w-full h-3 mb-1" />
                <Skeleton className="w-24 h-3" />
              </div>
            </div>
          ))
        ) : notifications?.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <Bell size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-white font-medium">All caught up!</h3>
            <p className="text-sm text-muted-foreground mt-1">No new notifications.</p>
          </div>
        ) : (
          notifications?.map((notif) => (
            <div 
              key={notif.id} 
              className={`flex gap-4 p-4 rounded-xl border transition-colors ${
                notif.read ? 'bg-background border-transparent opacity-70' : 'bg-card border-border shadow-sm'
              }`}
              onClick={() => !notif.read && handleMarkRead(notif.id)}
            >
              <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center shrink-0 border border-border">
                {getIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white truncate">{notif.title}</h4>
                  {!notif.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  {format(new Date(notif.createdAt), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}