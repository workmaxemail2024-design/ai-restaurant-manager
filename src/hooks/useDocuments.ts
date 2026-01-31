import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";

export interface Document {
  id: string;
  restaurant_id: string;
  location_id: string | null;
  supplier_id: string | null;
  category: string;
  filename: string;
  mime_type: string;
  storage_path: string;
  document_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // OCR extraction fields
  extracted_text: string | null;
  extracted_data: Record<string, unknown> | null;
  processing_status: string;
  // Joined fields
  location?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
}

export const DOCUMENT_CATEGORIES = [
  "Supplier Invoice",
  "Utility Bill",
  "Rent / Lease",
  "Payroll / Labour",
  "POS Export",
  "Stock Count Sheet",
  "Other",
] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

export interface DocumentFilters {
  category?: string;
  supplierId?: string;
  search?: string;
}

export interface UploadDocumentInput {
  file: File;
  category: string;
  locationId: string | null;
  supplierId: string | null;
  documentDate: string | null;
  notes: string | null;
}

export function useDocuments(filters: DocumentFilters = {}) {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["documents", restaurantId, selectedLocationId ?? "all", filters],
    queryFn: async () => {
      if (!restaurantId) return [];

      let query = supabase
        .from("documents")
        .select(`
          *,
          location:locations(id, name),
          supplier:suppliers(id, name)
        `)
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });

      // Location scope filter
      if (selectedLocationId) {
        query = query.or(`location_id.eq.${selectedLocationId},location_id.is.null`);
      }

      // Category filter
      if (filters.category) {
        query = query.eq("category", filters.category);
      }

      // Supplier filter
      if (filters.supplierId) {
        query = query.eq("supplier_id", filters.supplierId);
      }

      // Search filter (filename or notes)
      if (filters.search) {
        query = query.or(`filename.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Document[];
    },
    enabled: !!restaurantId,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useMutation({
    mutationFn: async (input: UploadDocumentInput) => {
      if (!restaurantId) throw new Error("No restaurant selected");

      // Generate a unique document ID for storage path
      const documentId = crypto.randomUUID();
      const locationFolder = input.locationId || "all";
      const storagePath = `restaurant/${restaurantId}/location/${locationFolder}/document/${documentId}/${input.file.name}`;

      // 1. Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, input.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. Insert document record
      const { data, error: insertError } = await supabase
        .from("documents")
        .insert({
          id: documentId,
          restaurant_id: restaurantId,
          location_id: input.locationId,
          supplier_id: input.supplierId,
          category: input.category,
          filename: input.file.name,
          mime_type: input.file.type || "application/octet-stream",
          storage_path: storagePath,
          document_date: input.documentDate,
          notes: input.notes,
        })
        .select()
        .single();

      if (insertError) {
        // Cleanup: delete uploaded file if DB insert fails
        await supabase.storage.from("documents").remove([storagePath]);
        throw insertError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Document uploaded successfully" });
    },
    onError: (error) => {
      toast({
        title: "Error uploading document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (document: Document) => {
      // 1. Delete from storage
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([document.storage_path]);

      if (storageError) {
        console.warn("Storage deletion warning:", storageError);
        // Continue with DB deletion even if storage fails
      }

      // 2. Delete from database
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", document.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Document deleted successfully" });
    },
    onError: (error) => {
      toast({
        title: "Error deleting document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDocumentUrl(storagePath: string | null) {
  return useQuery({
    queryKey: ["document-url", storagePath],
    queryFn: async () => {
      if (!storagePath) return null;

      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!storagePath,
    staleTime: 1000 * 60 * 50, // 50 minutes (before 1hr expiry)
  });
}
