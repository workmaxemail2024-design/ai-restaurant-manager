import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Paperclip, FileText, Sparkles, ExternalLink, Loader2, X, AlertTriangle, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import {
  useLinkedDocument,
  useUnlinkedDocuments,
  useLinkDocumentToPO,
  Document,
} from "@/hooks/useDocuments";
import { useCreateIngredient, UnitType } from "@/hooks/useIngredients";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  default_cost_price: number;
}

interface POInvoiceSectionProps {
  purchaseOrderId: string;
  locationId: string;
  supplierId: string;
  isPending: boolean;
  hasExistingItems: boolean;
  ingredients: Ingredient[];
  onAutoFillItems: (items: { ingredient_id: string; quantity: number; cost_price: number }[]) => Promise<void>;
  onTotalExtracted?: (total: number) => void;
}

interface ExtractedLineItem {
  name?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
}

interface UnmatchedItemWithSelection extends ExtractedLineItem {
  selected: boolean;
}

// Parse item_*_description, item_*_quantity, item_*_unit_price fields from extracted_data
function parseItemFields(extractedData: Record<string, unknown>): ExtractedLineItem[] {
  const items: ExtractedLineItem[] = [];
  
  // First check for line_items or items array (preferred format)
  if (extractedData.line_items && Array.isArray(extractedData.line_items)) {
    return extractedData.line_items as ExtractedLineItem[];
  }
  if (extractedData.items && Array.isArray(extractedData.items)) {
    return extractedData.items as ExtractedLineItem[];
  }
  
  // Parse item_*_description, item_*_quantity, item_*_unit_price fields
  const itemIndices = new Set<string>();
  for (const key of Object.keys(extractedData)) {
    const match = key.match(/^item_(\d+)_/);
    if (match) {
      itemIndices.add(match[1]);
    }
  }
  
  for (const idx of Array.from(itemIndices).sort((a, b) => parseInt(a) - parseInt(b))) {
    const description = extractedData[`item_${idx}_description`] as string | undefined;
    const quantity = extractedData[`item_${idx}_quantity`] as number | undefined;
    const unitPrice = extractedData[`item_${idx}_unit_price`] as number | undefined;
    const total = extractedData[`item_${idx}_total`] as number | undefined;
    
    if (description || quantity || unitPrice) {
      items.push({
        name: description,
        description: description,
        quantity: quantity,
        unit_price: unitPrice,
        total: total,
      });
    }
  }
  
  return items;
}

export function POInvoiceSection({
  purchaseOrderId,
  locationId,
  supplierId,
  isPending,
  hasExistingItems,
  ingredients,
  onAutoFillItems,
  onTotalExtracted,
}: POInvoiceSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedItemWithSelection[]>([]);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [creatingIngredients, setCreatingIngredients] = useState(false);

  const { data: linkedDoc, isLoading: loadingLinked } = useLinkedDocument(purchaseOrderId);
  // Use PO's location_id for document scoping (not global header location)
  const { data: unlinkedDocs = [], isLoading: loadingUnlinked } = useUnlinkedDocuments(locationId, supplierId);
  const linkDocument = useLinkDocumentToPO();
  const createIngredient = useCreateIngredient();

  const handleAttach = async (doc: Document) => {
    await linkDocument.mutateAsync({ documentId: doc.id, purchaseOrderId });
    setPickerOpen(false);
    toast({ title: "Invoice attached to purchase order" });
  };

  const handleDetach = async () => {
    if (linkedDoc) {
      await linkDocument.mutateAsync({ documentId: linkedDoc.id, purchaseOrderId: null });
      toast({ title: "Invoice detached from purchase order" });
    }
  };

  const handleViewDocument = async () => {
    if (!linkedDoc) return;
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(linkedDoc.storage_path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error("Error getting document URL:", err);
    }
  };

  const processAutoFill = async () => {
    if (!linkedDoc?.extracted_data) return;

    setAutoFilling(true);
    try {
      const extractedData = linkedDoc.extracted_data as Record<string, unknown>;
      
      // Extract total and notify parent
      const extractedTotal = extractedData.total as number | undefined;
      if (extractedTotal && onTotalExtracted) {
        onTotalExtracted(extractedTotal);
      }
      
      // Parse line items from various formats
      const lineItems = parseItemFields(extractedData);
      
      const matchedItems: { ingredient_id: string; quantity: number; cost_price: number }[] = [];
      const unmatched: ExtractedLineItem[] = [];

      for (const item of lineItems) {
        const itemName = (item.name || item.description || "").toLowerCase().trim();
        if (!itemName) continue;

        // Case-insensitive "contains" matching
        const matchedIngredient = ingredients.find((ing) =>
          itemName.includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(itemName)
        );

        if (matchedIngredient) {
          matchedItems.push({
            ingredient_id: matchedIngredient.id,
            quantity: item.quantity || 1,
            cost_price: item.unit_price || item.total || matchedIngredient.default_cost_price,
          });
        } else {
          unmatched.push(item);
        }
      }

      if (matchedItems.length > 0) {
        await onAutoFillItems(matchedItems);
        toast({
          title: "Items populated from invoice",
          description: `${matchedItems.length} item(s) added${unmatched.length > 0 ? `, ${unmatched.length} unmatched` : ""}`,
        });
      }

      if (unmatched.length > 0) {
        // Add selection state to unmatched items
        setUnmatchedItems(unmatched.map(item => ({ ...item, selected: true })));
        setUnmatchedOpen(true);
      } else if (matchedItems.length === 0 && lineItems.length === 0) {
        toast({
          title: "No items found",
          description: "Could not find any line items in the invoice data",
          variant: "destructive",
        });
      } else if (matchedItems.length === 0) {
        // All items unmatched but we have line items
        setUnmatchedItems(unmatched.map(item => ({ ...item, selected: true })));
        setUnmatchedOpen(true);
      }
    } catch (err) {
      console.error("Auto-fill error:", err);
      toast({
        title: "Auto-fill failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAutoFilling(false);
    }
  };

  const handleAutoFillClick = () => {
    if (hasExistingItems) {
      setConfirmReplaceOpen(true);
    } else {
      processAutoFill();
    }
  };

  const toggleUnmatchedItem = (index: number) => {
    setUnmatchedItems(prev => 
      prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item)
    );
  };

  const handleCreateIngredients = async () => {
    const selectedItems = unmatchedItems.filter(item => item.selected);
    if (selectedItems.length === 0) {
      setUnmatchedOpen(false);
      return;
    }

    setCreatingIngredients(true);
    try {
      const newPOItems: { ingredient_id: string; quantity: number; cost_price: number }[] = [];

      for (const item of selectedItems) {
        const name = (item.name || item.description || "").trim();
        if (!name) continue;

        // Create new ingredient with default unit "each" and cost from invoice
        const costPrice = item.unit_price || item.total || 0;
        const newIngredient = await createIngredient.mutateAsync({
          name,
          unit: "each" as UnitType,
          storage_type: "dry",
          default_cost_price: costPrice,
        });

        // Add to PO items
        newPOItems.push({
          ingredient_id: newIngredient.id,
          quantity: item.quantity || 1,
          cost_price: costPrice,
        });
      }

      if (newPOItems.length > 0) {
        await onAutoFillItems(newPOItems);
        toast({
          title: "Ingredients created",
          description: `${newPOItems.length} new ingredient(s) created and added to the order`,
        });
      }

      setUnmatchedOpen(false);
      setUnmatchedItems([]);
    } catch (err) {
      console.error("Error creating ingredients:", err);
      toast({
        title: "Error creating ingredients",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreatingIngredients(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processing":
        return <Badge variant="secondary" className="text-xs bg-warning/20 text-warning">Processing</Badge>;
      case "processed":
        return <Badge variant="secondary" className="text-xs bg-success/20 text-success">Processed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Uploaded</Badge>;
    }
  };

  if (!isPending) return null;

  return (
    <div className="border border-border rounded-lg p-4 mb-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Invoice (optional)</span>
      </div>

      {loadingLinked ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : linkedDoc ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{linkedDoc.filename}</span>
              {getStatusBadge(linkedDoc.processing_status)}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={handleViewDocument}>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDetach} disabled={linkDocument.isPending}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoFillClick}
            disabled={linkedDoc.processing_status !== "processed" || autoFilling}
          >
            {autoFilling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2 text-warning" />
            )}
            Auto-fill from Invoice
          </Button>
          {linkedDoc.processing_status !== "processed" && (
            <p className="text-xs text-muted-foreground">Run OCR extraction on the document first to enable auto-fill</p>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Paperclip className="h-4 w-4 mr-2" />
          Attach Invoice
        </Button>
      )}

      {/* Invoice Picker Modal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Invoice Document</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {loadingUnlinked ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : unlinkedDocs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No unlinked documents available for this location
              </p>
            ) : (
              <div className="space-y-2">
                {unlinkedDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleAttach(doc)}
                    disabled={linkDocument.isPending}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors text-left",
                      doc.supplier_id === supplierId && "border-primary/50 bg-primary/5"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.supplier?.name || "No supplier"} • {doc.location?.name || "All locations"} • {format(new Date(doc.created_at), "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(doc.processing_status)}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirm Replace Dialog */}
      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing items?</AlertDialogTitle>
            <AlertDialogDescription>
              This purchase order already has items. Auto-fill will add new items from the invoice. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmReplaceOpen(false); processAutoFill(); }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unmatched Items Dialog - with option to create ingredients */}
      <Dialog open={unmatchedOpen} onOpenChange={setUnmatchedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Unmatched Items
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            The following invoice items could not be matched to existing ingredients. Select items to create as new ingredients:
          </p>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {unmatchedItems.map((item, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "p-3 rounded-lg border transition-colors cursor-pointer",
                    item.selected 
                      ? "border-primary bg-primary/5" 
                      : "border-border bg-muted/50"
                  )}
                  onClick={() => toggleUnmatchedItem(idx)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox 
                      checked={item.selected} 
                      onCheckedChange={() => toggleUnmatchedItem(idx)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name || item.description || "Unknown item"}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity ?? "1"} • Price: {formatCurrency(item.unit_price ?? item.total ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setUnmatchedOpen(false)}>
              Skip
            </Button>
            <Button 
              onClick={handleCreateIngredients} 
              disabled={creatingIngredients || unmatchedItems.filter(i => i.selected).length === 0}
            >
              {creatingIngredients ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlusCircle className="h-4 w-4 mr-2" />
              )}
              Create {unmatchedItems.filter(i => i.selected).length} Ingredient(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
