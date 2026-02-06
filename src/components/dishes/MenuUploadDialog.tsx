import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Image, Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MenuReviewTable, ExtractedDish } from "./MenuReviewTable";
import { useCreateDish, DishInsert } from "@/hooks/useDishes";
import { useLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";

interface MenuUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UploadStep = "upload" | "processing" | "review" | "creating";

export function MenuUploadDialog({ open, onOpenChange }: MenuUploadDialogProps) {
  const [step, setStep] = useState<UploadStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extractedDishes, setExtractedDishes] = useState<ExtractedDish[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createDish = useCreateDish();
  const { selectedLocationId } = useLocation();

  const resetState = () => {
    setStep("upload");
    setFile(null);
    setExtractedDishes([]);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(selectedFile.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or image file (JPG, PNG, WebP)",
          variant: "destructive"
        });
        return;
      }
      
      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB",
          variant: "destructive"
        });
        return;
      }
      
      setFile(selectedFile);
      setError(null);
    }
  };

  const processMenu = async () => {
    if (!file) return;
    
    setStep("processing");
    setError(null);
    
    try {
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      
      const { data, error: fnError } = await supabase.functions.invoke("ai-menu-extract", {
        body: {
          imageBase64: base64,
          mimeType: file.type
        }
      });
      
      if (fnError) {
        throw new Error(fnError.message || "Failed to process menu");
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      if (!data.dishes || data.dishes.length === 0) {
        throw new Error("No dishes found in the menu. Please try a clearer image.");
      }
      
      // Add selection state and unique IDs to dishes
      const dishesWithState = data.dishes.map((dish: any, index: number) => ({
        ...dish,
        id: `extract-${index}`,
        selected: true,
        price: dish.price ?? 0
      }));
      
      setExtractedDishes(dishesWithState);
      setStep("review");
      
    } catch (err) {
      console.error("Menu processing error:", err);
      setError(err instanceof Error ? err.message : "Failed to process menu");
      setStep("upload");
    }
  };

  const handleCreateDishes = async (dishes: ExtractedDish[]) => {
    const selectedDishes = dishes.filter(d => d.selected);
    
    if (selectedDishes.length === 0) {
      toast({
        title: "No dishes selected",
        description: "Please select at least one dish to create",
        variant: "destructive"
      });
      return;
    }
    
    setStep("creating");
    
    try {
      let successCount = 0;
      let errorCount = 0;
      
      for (const dish of selectedDishes) {
        try {
          const dishData: DishInsert = {
            name: dish.name.trim(),
            category: dish.category || null,
            selling_price: dish.price || 0,
            location_id: selectedLocationId || undefined
          };
          
          await createDish.mutateAsync(dishData);
          successCount++;
        } catch (err) {
          console.error("Error creating dish:", dish.name, err);
          errorCount++;
        }
      }
      
      if (successCount > 0) {
        toast({
          title: "Dishes created",
          description: `Successfully created ${successCount} dish${successCount !== 1 ? "es" : ""}${errorCount > 0 ? `. ${errorCount} failed.` : ""}`
        });
      }
      
      handleClose();
      
    } catch (err) {
      console.error("Dish creation error:", err);
      toast({
        title: "Error creating dishes",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive"
      });
      setStep("review");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className={cn(
        "max-h-[90vh] overflow-hidden flex flex-col",
        step === "review" ? "max-w-4xl" : "max-w-md"
      )}>
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Upload Menu"}
            {step === "processing" && "Processing Menu..."}
            {step === "review" && "Review Extracted Dishes"}
            {step === "creating" && "Creating Dishes..."}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a menu image or PDF. We'll extract dish names, categories, and prices using AI.
            </p>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                file ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              )}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  {file.type.startsWith("image/") ? (
                    <Image className="h-10 w-10 text-primary" />
                  ) : (
                    <FileText className="h-10 w-10 text-primary" />
                  )}
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to upload menu</p>
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP (max 10MB)</p>
                </div>
              )}
            </div>
            
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={processMenu} disabled={!file}>
                Extract Dishes
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing menu with AI...</p>
            <p className="text-xs text-muted-foreground">This may take a few seconds</p>
          </div>
        )}

        {step === "review" && (
          <MenuReviewTable
            dishes={extractedDishes}
            onDishesChange={setExtractedDishes}
            onConfirm={handleCreateDishes}
            onCancel={handleClose}
          />
        )}

        {step === "creating" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creating dishes...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
