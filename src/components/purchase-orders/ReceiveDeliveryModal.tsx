import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Loader2, AlertCircle } from "lucide-react";
import { PurchaseOrderItem } from "@/hooks/usePurchaseOrders";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DeliveryItem {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_unit: string;
  ordered_quantity: number;
  delivered_quantity: number;
}

interface ReceiveDeliveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItems: PurchaseOrderItem[];
  onConfirm: (items: DeliveryItem[]) => Promise<void>;
  isProcessing: boolean;
}

export function ReceiveDeliveryModal({
  open,
  onOpenChange,
  orderItems,
  onConfirm,
  isProcessing,
}: ReceiveDeliveryModalProps) {
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItem[]>([]);

  // Initialize delivery items when modal opens
  useEffect(() => {
    if (open && orderItems.length > 0) {
      setDeliveryItems(
        orderItems.map((item) => ({
          id: item.id,
          ingredient_id: item.ingredient_id,
          ingredient_name: item.ingredients?.name || "Unknown",
          ingredient_unit: item.ingredients?.unit || "",
          ordered_quantity: Number(item.quantity),
          delivered_quantity: Number(item.quantity), // Default to ordered quantity
        }))
      );
    }
  }, [open, orderItems]);

  const handleQuantityChange = (itemId: string, value: number) => {
    setDeliveryItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, delivered_quantity: Math.max(0, value) }
          : item
      )
    );
  };

  const handleConfirm = async () => {
    await onConfirm(deliveryItems);
  };

  const hasDiscrepancies = deliveryItems.some(
    (item) => item.delivered_quantity !== item.ordered_quantity
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Receive Delivery
          </DialogTitle>
          <DialogDescription>
            Confirm the quantities received. Stock levels will be updated accordingly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {orderItems.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No items in this purchase order. Add items before receiving.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="border border-border rounded-lg divide-y divide-border max-h-[300px] overflow-y-auto">
                {deliveryItems.map((item) => (
                  <div key={item.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.ingredient_name}</span>
                      <span className="text-sm text-muted-foreground">
                        Ordered: {item.ordered_quantity.toFixed(2)} {item.ingredient_unit}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`qty-${item.id}`} className="text-sm whitespace-nowrap">
                        Delivered:
                      </Label>
                      <Input
                        id={`qty-${item.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.delivered_quantity}
                        onChange={(e) =>
                          handleQuantityChange(item.id, parseFloat(e.target.value) || 0)
                        }
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">{item.ingredient_unit}</span>
                      {item.delivered_quantity !== item.ordered_quantity && (
                        <span className="text-xs text-warning ml-auto">
                          {item.delivered_quantity > item.ordered_quantity ? "+" : ""}
                          {(item.delivered_quantity - item.ordered_quantity).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {hasDiscrepancies && (
                <Alert variant="default" className="border-warning/50 bg-warning/10">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-warning">
                    Some delivered quantities differ from ordered quantities.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || orderItems.length === 0}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Confirm Receipt"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
