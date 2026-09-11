import { format } from "date-fns";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useLatestCaptivaSync } from "@/hooks/usePOS";

interface Props {
  locationId: string;
}

/**
 * Owner-facing outcome of the most recent Captiva sync for one location.
 * A completed call that returned no usable rows is shown as "No data",
 * never as a success.
 */
export function CaptivaSyncStatus({ locationId }: Props) {
  const { data } = useLatestCaptivaSync(locationId);

  if (!data) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        No Captiva sync has run for this location yet.
      </div>
    );
  }

  const tone =
    data.status === "success"
      ? "text-green-600 dark:text-green-400"
      : data.status === "no_data"
      ? "text-amber-600 dark:text-amber-400"
      : "text-destructive";

  const Icon = data.status === "success" ? CheckCircle2 : data.status === "no_data" ? AlertTriangle : XCircle;

  const label =
    data.status === "success"
      ? data.partial
        ? "Partly imported"
        : "Imported"
      : data.status === "no_data"
      ? "Completed — no sales data returned"
      : "Failed";

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Last sync attempt</span>
        <span>{format(new Date(data.attemptedAt), "MMM d, HH:mm")}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Result</span>
        <span className={`flex items-center gap-1.5 font-medium ${tone}`}>
          <Icon className="h-4 w-4" />
          {label}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Rows imported</span>
        <span className="font-medium">{data.rowsImported}</span>
      </div>
      {data.errorText && (
        <p className="text-xs text-destructive bg-destructive/10 p-2 rounded break-words">
          {data.errorText}
        </p>
      )}
      {data.rejectedMessage && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-2 rounded break-words">
          {data.rejectedMessage}
        </p>
      )}
    </div>
  );
}
