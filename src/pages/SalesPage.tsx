import { useState } from "react";
import { Calendar, Plus } from "lucide-react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCreateSale, type SaleInsert } from "@/hooks/useSales";
import { useDishes } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/currency";
import { DataWarningBanner } from "@/components/common/DataWarningBanner";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { CaptivaDailyFigures } from "@/components/pos/CaptivaDailyFigures";
import { RangeProductsSold } from "@/components/sales/SalesProducts";
import { formatOrdinalDate, formatOrdinalRange } from "@/lib/ordinalDate";

export default function SalesPage() {
  const { selectedLocationId } = useLocation();
  const { startDate, endDate, presetLabel } = useDateRange();
  const isSingleDay = startDate === endDate;
  const { data: dishes = [] } = useDishes(selectedLocationId);
  const { data: locations = [] } = useLocations();
  const createSale = useCreateSale();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<SaleInsert>({ location_id: "", dish_id: "", quantity: 1, total_price: 0 });

  const handleClose = () => {
    setIsOpen(false);
    setFormData({ location_id: "", dish_id: "", quantity: 1, total_price: 0 });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await createSale.mutateAsync(formData);
    handleClose();
  };

  const handleDishChange = (dishId: string) => {
    const dish = dishes.find(item => item.id === dishId);
    setFormData({ ...formData, dish_id: dishId, total_price: dish ? Number(dish.selling_price) * formData.quantity : 0 });
  };

  const handleQuantityChange = (quantity: number) => {
    const dish = dishes.find(item => item.id === formData.dish_id);
    setFormData({ ...formData, quantity, total_price: dish ? Number(dish.selling_price) * quantity : 0 });
  };

  const recordSale = <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
    <DialogTrigger asChild><Button onClick={() => setIsOpen(true)}><Plus className="mr-2 h-4 w-4" /> Record Sale</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><Label>Location</Label>
          <Select value={formData.location_id} onValueChange={value => setFormData({ ...formData, location_id: value })} required>
            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
            <SelectContent>{locations.map(location => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Dish</Label>
          <Select value={formData.dish_id} onValueChange={handleDishChange} required>
            <SelectTrigger><SelectValue placeholder="Select dish" /></SelectTrigger>
            <SelectContent>{dishes.map(dish => <SelectItem key={dish.id} value={dish.id}>{dish.name} - {formatCurrency(Number(dish.selling_price))}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label htmlFor="quantity">Quantity</Label><Input id="quantity" type="number" min="1" value={formData.quantity} onChange={event => handleQuantityChange(parseInt(event.target.value) || 1)} required /></div>
        <div><Label>Total Price</Label><Input type="number" step="0.01" value={formData.total_price} onChange={event => setFormData({ ...formData, total_price: parseFloat(event.target.value) || 0 })} required /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={handleClose}>Cancel</Button><Button type="submit" disabled={createSale.isPending || !formData.location_id || !formData.dish_id}>Record Sale</Button></div>
      </form>
    </DialogContent>
  </Dialog>;

  return <PageLayout title="Sales" subtitle="Review daily Captiva performance, products sold and manually recorded sales." action={recordSale}>
    <DataWarningBanner locationId={selectedLocationId} filterTypes={["missing_recipes", "missing_sales", "missing_product_detail"]} className="mb-4" />

    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{presetLabel}</span>
        <span className="text-muted-foreground">{isSingleDay ? formatOrdinalDate(startDate, true) : formatOrdinalRange(startDate, endDate)}</span>
        {!isSingleDay && <Badge variant="secondary" className="text-[10px]">Selected period</Badge>}
      </div>
      <DateRangeSelector />
    </div>

    <div className="space-y-5">
      <CaptivaDailyFigures start={startDate} end={endDate} />
      <RangeProductsSold start={startDate} end={endDate} />
    </div>
  </PageLayout>;
}
