import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertTriangle, Package, Link2, Search, Filter,
} from "lucide-react";
import { useDishes } from "@/hooks/useDishes";
import { useExternalPOSItems, useUpdateExternalPOSItem } from "@/hooks/usePOS";
import { formatCurrency } from "@/lib/currency";

interface POSDishMappingTabProps {
  locationId: string;
  posProvider: string;
  restaurantId: string;
}

type StatusFilter = "all" | "review" | "mapped";

export function POSDishMappingTab({ locationId, posProvider }: POSDishMappingTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: items = [], isLoading } = useExternalPOSItems(locationId, posProvider);
  const { data: dishes } = useDishes();
  const update = useUpdateExternalPOSItem();

  const stats = useMemo(() => {
    let mapped = 0, review = 0, unmappedRev = 0;
    for (const it of items) {
      const isMapped = !!it.mapped_dish_id && !it.needs_review;
      if (isMapped) mapped += 1;
      else {
        review += 1;
        unmappedRev += Number(it.last_gross || 0);
      }
    }
    return { mapped, review, unmappedRev, total: items.length };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const isMapped = !!it.mapped_dish_id && !it.needs_review;
      if (statusFilter === "mapped" && !isMapped) return false;
      if (statusFilter === "review" && isMapped) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = `${it.external_item_name || ""} ${it.external_item_id} ${it.department || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, searchQuery, statusFilter]);

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid gap-2 md:grid-cols-3">
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span className="text-[11px] text-muted-foreground">Needs review</span>
              </div>
              <span className="text-lg font-bold">{stats.review}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">Mapped</span>
              </div>
              <span className="text-lg font-bold">{stats.mapped}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Unmapped rev</span>
              </div>
              <span className="text-lg font-bold">{formatCurrency(stats.unmappedRev)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-2.5 px-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search product, ID or department…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {(["all", "review", "mapped"] as const).map((s) => (
                <Badge
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  className="cursor-pointer text-[10px] h-5 px-1.5 capitalize"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "review" ? "Needs review" : s}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-medium">
            Imported Captiva products ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-3 pb-3">
          {isLoading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5 text-primary" />
              <p className="text-xs">No products match this filter.</p>
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 px-1 font-medium">POS ID</th>
                    <th className="py-1.5 px-1 font-medium">Product</th>
                    <th className="py-1.5 px-1 font-medium">Dept</th>
                    <th className="py-1.5 px-1 font-medium text-right">Qty</th>
                    <th className="py-1.5 px-1 font-medium text-right">Gross</th>
                    <th className="py-1.5 px-1 font-medium">Master dish</th>
                    <th className="py-1.5 px-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const isMapped = !!it.mapped_dish_id && !it.needs_review;
                    return (
                      <tr key={it.id} className="border-b hover:bg-muted/40">
                        <td className="py-1.5 px-1 font-mono text-[10px] text-muted-foreground">{it.external_item_id}</td>
                        <td className="py-1.5 px-1 font-medium truncate max-w-[180px]">{it.external_item_name || "—"}</td>
                        <td className="py-1.5 px-1 text-muted-foreground truncate max-w-[110px]">{it.department || "—"}</td>
                        <td className="py-1.5 px-1 text-right">{Number(it.last_qty || 0)}</td>
                        <td className="py-1.5 px-1 text-right">{formatCurrency(Number(it.last_gross || 0))}</td>
                        <td className="py-1.5 px-1">
                          <Select
                            value={it.mapped_dish_id || ""}
                            onValueChange={(v) => update.mutate({ id: it.id, mapped_dish_id: v || null })}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[160px]">
                              <SelectValue placeholder="Select dish" />
                            </SelectTrigger>
                            <SelectContent>
                              {dishes?.map((d) => (
                                <SelectItem key={d.id} value={d.id} className="text-xs">
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 px-1">
                          {isMapped ? (
                            <Badge variant="default" className="text-[9px] h-4 px-1.5">Mapped</Badge>
                          ) : it.mapped_dish_id ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Auto · review</Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1.5 text-[10px]"
                                onClick={() => update.mutate({ id: it.id, needs_review: false })}
                              >
                                Mark reviewed
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1.5">Unmapped</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
