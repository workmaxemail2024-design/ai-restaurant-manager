import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  keyField?: keyof T;
}

export function DataTable<T extends { id?: string }>({
  data,
  columns,
  isLoading,
  onEdit,
  onDelete,
  keyField = "id" as keyof T,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={String(col.key)} className="h-10 text-xs font-medium uppercase tracking-wide">{col.header}</TableHead>
              ))}
              {(onEdit || onDelete) && <TableHead className="w-20 h-10">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="border-border">
                {columns.map((col) => (
                  <TableCell key={String(col.key)} className="py-2.5">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                ))}
                {(onEdit || onDelete) && (
                  <TableCell className="py-2.5">
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            {columns.map((col) => (
              <TableHead key={String(col.key)} className="h-10 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {col.header}
              </TableHead>
            ))}
            {(onEdit || onDelete) && <TableHead className="w-20 h-10">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (onEdit || onDelete ? 1 : 0)} className="text-center text-muted-foreground py-10 text-sm">
                <p className="font-medium text-foreground">No data available</p>
                <p className="text-xs mt-1">Records will appear here once data is added.</p>
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => (
              <TableRow key={String(item[keyField])} className="border-border transition-colors hover:bg-muted/50">
                {columns.map((col) => (
                  <TableCell key={String(col.key)} className="py-2.5 text-sm">
                    {col.render ? col.render(item) : String(item[col.key as keyof T] ?? "-")}
                  </TableCell>
                ))}
                {(onEdit || onDelete) && (
                  <TableCell className="py-2.5">
                    <div className="flex gap-1">
                      {onEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-secondary" onClick={() => onEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(item)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
