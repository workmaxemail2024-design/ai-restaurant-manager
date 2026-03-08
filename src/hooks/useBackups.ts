import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { toast } from "sonner";

export interface SystemBackup {
  id: string;
  restaurant_id: string;
  created_at: string;
  status: string;
  backup_type: string;
  file_path: string | null;
  size_bytes: number | null;
  error_message: string | null;
  created_by: string | null;
  notes: string | null;
}

export function useBackups() {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;
  const queryClient = useQueryClient();

  const backupsQuery = useQuery({
    queryKey: ["system_backups", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_backups" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as SystemBackup[]) ?? [];
    },
  });

  const createBackup = useMutation({
    mutationFn: async (backupType: string = "manual") => {
      const { data, error } = await supabase.functions.invoke("create-backup", {
        body: { backup_type: backupType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Backup created successfully");
      queryClient.invalidateQueries({ queryKey: ["system_backups"] });
    },
    onError: (err: Error) => {
      toast.error(`Backup failed: ${err.message}`);
    },
  });

  const lastSuccessful = backupsQuery.data?.find((b) => b.status === "success");
  const latestBackup = backupsQuery.data?.[0];
  const hasRecentFailure = latestBackup?.status === "failed";
  const lastSuccessTime = lastSuccessful?.created_at
    ? new Date(lastSuccessful.created_at)
    : null;
  const isStale =
    !lastSuccessTime ||
    Date.now() - lastSuccessTime.getTime() > 24 * 60 * 60 * 1000;

  return {
    backups: backupsQuery.data ?? [],
    isLoading: backupsQuery.isLoading,
    createBackup,
    lastSuccessful,
    hasRecentFailure,
    isStale,
    needsWarning: isStale || hasRecentFailure,
  };
}
