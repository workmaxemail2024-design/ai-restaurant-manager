export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      actual_expenses: {
        Row: {
          amount: number
          bill_date: string | null
          category: string
          cost_type: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string
          description: string
          document_id: string | null
          duplicate_confirmed: boolean
          id: string
          import_batch_id: string | null
          invoice_reference: string | null
          location_id: string
          notes: string | null
          period_month: string
          replaces_overhead_id: string | null
          restaurant_id: string
          source_category: string | null
          source_ref: string | null
          status: string
          supplier_key: string
          supplier_name: string | null
          updated_at: string
          vat_amount: number | null
          vat_treatment: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          bill_date?: string | null
          category: string
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          description: string
          document_id?: string | null
          duplicate_confirmed?: boolean
          id?: string
          import_batch_id?: string | null
          invoice_reference?: string | null
          location_id: string
          notes?: string | null
          period_month: string
          replaces_overhead_id?: string | null
          restaurant_id: string
          source_category?: string | null
          source_ref?: string | null
          status?: string
          supplier_key?: string
          supplier_name?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_treatment: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          bill_date?: string | null
          category?: string
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          description?: string
          document_id?: string | null
          duplicate_confirmed?: boolean
          id?: string
          import_batch_id?: string | null
          invoice_reference?: string | null
          location_id?: string
          notes?: string | null
          period_month?: string
          replaces_overhead_id?: string | null
          restaurant_id?: string
          source_category?: string | null
          source_ref?: string | null
          status?: string
          supplier_key?: string
          supplier_name?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_treatment?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actual_expenses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_expenses_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "expense_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_expenses_replaces_overhead_id_fkey"
            columns: ["replaces_overhead_id"]
            isOneToOne: false
            referencedRelation: "overheads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_expenses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      actual_payroll: {
        Row: {
          amount: number
          change_reason: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          ended_at: string | null
          ended_by: string | null
          ended_reason: string | null
          id: string
          import_batch_id: string | null
          location_id: string
          period_month: string
          restaurant_id: string
          scope: string
          scope_note: string | null
          source: string
          status: string
          supersedes_id: string | null
        }
        Insert: {
          amount: number
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_reason?: string | null
          id?: string
          import_batch_id?: string | null
          location_id: string
          period_month: string
          restaurant_id: string
          scope: string
          scope_note?: string | null
          source: string
          status?: string
          supersedes_id?: string | null
        }
        Update: {
          amount?: number
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_reason?: string | null
          id?: string
          import_batch_id?: string | null
          location_id?: string
          period_month?: string
          restaurant_id?: string
          scope?: string
          scope_note?: string | null
          source?: string
          status?: string
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actual_payroll_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_payroll_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "expense_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_payroll_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_payroll_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_payroll_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "actual_payroll"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          created_at: string
          data: Json | null
          description: string
          event_type: string
          id: string
          restaurant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          description: string
          event_type: string
          id?: string
          restaurant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          description?: string
          event_type?: string
          id?: string
          restaurant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rule_runs: {
        Row: {
          created_at: string
          id: string
          message: string | null
          restaurant_id: string
          rule_id: string
          run_data: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          restaurant_id: string
          rule_id: string
          run_data?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          restaurant_id?: string
          rule_id?: string
          run_data?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rule_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_run: string | null
          name: string
          restaurant_id: string
          run_frequency: string
          trigger: Json
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run?: string | null
          name: string
          restaurant_id: string
          run_frequency?: string
          trigger?: Json
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run?: string | null
          name?: string
          restaurant_id?: string
          run_frequency?: string
          trigger?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_ai_summaries: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          metrics_json: Json
          restaurant_id: string
          summary_date: string
          summary_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          metrics_json?: Json
          restaurant_id: string
          summary_date: string
          summary_text: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          metrics_json?: Json
          restaurant_id?: string
          summary_date?: string
          summary_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_ai_summaries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_ai_summaries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          document_id: string | null
          entry_date: string
          id: string
          location_id: string
          note: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          entry_date: string
          id?: string
          location_id: string
          note?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          entry_date?: string
          id?: string
          location_id?: string
          note?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_expenses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_expenses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_ledger_entries: {
        Row: {
          additional_expenses: number | null
          covers: number | null
          covers_unknown: boolean
          created_at: string
          entry_date: string
          expenses_confirmed: boolean
          id: string
          is_closed: boolean
          labour_confirmed: boolean
          labour_confirmed_at: string | null
          labour_confirmed_by: string | null
          labour_hours: number | null
          location_id: string | null
          manual_orders: number | null
          manual_revenue: number | null
          notes: string | null
          restaurant_id: string
          stock_reviewed: boolean
          stock_reviewed_at: string | null
          stock_reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          additional_expenses?: number | null
          covers?: number | null
          covers_unknown?: boolean
          created_at?: string
          entry_date: string
          expenses_confirmed?: boolean
          id?: string
          is_closed?: boolean
          labour_confirmed?: boolean
          labour_confirmed_at?: string | null
          labour_confirmed_by?: string | null
          labour_hours?: number | null
          location_id?: string | null
          manual_orders?: number | null
          manual_revenue?: number | null
          notes?: string | null
          restaurant_id: string
          stock_reviewed?: boolean
          stock_reviewed_at?: string | null
          stock_reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          additional_expenses?: number | null
          covers?: number | null
          covers_unknown?: boolean
          created_at?: string
          entry_date?: string
          expenses_confirmed?: boolean
          id?: string
          is_closed?: boolean
          labour_confirmed?: boolean
          labour_confirmed_at?: string | null
          labour_confirmed_by?: string | null
          labour_hours?: number | null
          location_id?: string | null
          manual_orders?: number | null
          manual_revenue?: number | null
          notes?: string | null
          restaurant_id?: string
          stock_reviewed?: boolean
          stock_reviewed_at?: string | null
          stock_reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_ledger_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_ledger_entries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dish_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_ingredients: {
        Row: {
          cost_mode: string
          created_at: string
          dish_id: string
          id: string
          ingredient_id: string
          manual_cost_effective_from: string | null
          manual_cost_set_at: string | null
          manual_cost_set_by: string | null
          manual_line_cost: number | null
          needs_unit_review: boolean
          quantity: number
          restaurant_id: string | null
          unit: string | null
        }
        Insert: {
          cost_mode?: string
          created_at?: string
          dish_id: string
          id?: string
          ingredient_id: string
          manual_cost_effective_from?: string | null
          manual_cost_set_at?: string | null
          manual_cost_set_by?: string | null
          manual_line_cost?: number | null
          needs_unit_review?: boolean
          quantity?: number
          restaurant_id?: string | null
          unit?: string | null
        }
        Update: {
          cost_mode?: string
          created_at?: string
          dish_id?: string
          id?: string
          ingredient_id?: string
          manual_cost_effective_from?: string | null
          manual_cost_set_at?: string | null
          manual_cost_set_by?: string | null
          manual_line_cost?: number | null
          needs_unit_review?: boolean
          quantity?: number
          restaurant_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dish_ingredients_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dishes: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          base_dish_id: string | null
          captiva_external_id: string | null
          category: string | null
          created_at: string
          department: string | null
          direct_cost: number | null
          id: string
          is_active: boolean
          item_type: string
          location_id: string | null
          merged_into_id: string | null
          name: string
          needs_review: boolean
          recipe_multiplier: number | null
          restaurant_id: string | null
          selling_price: number
          source: string
          updated_at: string
          use_direct_cost: boolean
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          base_dish_id?: string | null
          captiva_external_id?: string | null
          category?: string | null
          created_at?: string
          department?: string | null
          direct_cost?: number | null
          id?: string
          is_active?: boolean
          item_type?: string
          location_id?: string | null
          merged_into_id?: string | null
          name: string
          needs_review?: boolean
          recipe_multiplier?: number | null
          restaurant_id?: string | null
          selling_price?: number
          source?: string
          updated_at?: string
          use_direct_cost?: boolean
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          base_dish_id?: string | null
          captiva_external_id?: string | null
          category?: string | null
          created_at?: string
          department?: string | null
          direct_cost?: number | null
          id?: string
          is_active?: boolean
          item_type?: string
          location_id?: string | null
          merged_into_id?: string | null
          name?: string
          needs_review?: boolean
          recipe_multiplier?: number | null
          restaurant_id?: string | null
          selling_price?: number
          source?: string
          updated_at?: string
          use_direct_cost?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dishes_base_dish_id_fkey"
            columns: ["base_dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dishes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dishes_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dishes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string
          document_date: string | null
          extracted_data: Json | null
          extracted_text: string | null
          filename: string
          id: string
          location_id: string | null
          mime_type: string
          notes: string | null
          processing_status: string
          purchase_order_id: string | null
          restaurant_id: string
          storage_path: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          document_date?: string | null
          extracted_data?: Json | null
          extracted_text?: string | null
          filename: string
          id?: string
          location_id?: string | null
          mime_type: string
          notes?: string | null
          processing_status?: string
          purchase_order_id?: string | null
          restaurant_id: string
          storage_path: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          document_date?: string | null
          extracted_data?: Json | null
          extracted_text?: string | null
          filename?: string
          id?: string
          location_id?: string | null
          mime_type?: string
          notes?: string | null
          processing_status?: string
          purchase_order_id?: string | null
          restaurant_id?: string
          storage_path?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string | null
          file_hash: string | null
          filename: string
          id: string
          restaurant_id: string
          rows_actual: number
          rows_estimate: number
          rows_payroll: number
          rows_skipped: number
          source_type: string
          summary: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          file_hash?: string | null
          filename: string
          id?: string
          restaurant_id: string
          rows_actual?: number
          rows_estimate?: number
          rows_payroll?: number
          rows_skipped?: number
          source_type: string
          summary?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          file_hash?: string | null
          filename?: string
          id?: string
          restaurant_id?: string
          rows_actual?: number
          rows_estimate?: number
          rows_payroll?: number
          rows_skipped?: number
          source_type?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "expense_import_batches_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_import_batches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      external_pos_items: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          department: string | null
          display_name: string | null
          external_item_id: string
          external_item_name: string | null
          id: string
          last_gross: number | null
          last_qty: number | null
          last_seen_at: string | null
          location_id: string
          manual_department: string | null
          manual_drink_type: string | null
          manual_type: string | null
          mapped_dish_id: string | null
          merged_into_id: string | null
          needs_review: boolean
          pos_provider: string
          restaurant_id: string
          source: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          external_item_id: string
          external_item_name?: string | null
          id?: string
          last_gross?: number | null
          last_qty?: number | null
          last_seen_at?: string | null
          location_id: string
          manual_department?: string | null
          manual_drink_type?: string | null
          manual_type?: string | null
          mapped_dish_id?: string | null
          merged_into_id?: string | null
          needs_review?: boolean
          pos_provider: string
          restaurant_id: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          external_item_id?: string
          external_item_name?: string | null
          id?: string
          last_gross?: number | null
          last_qty?: number | null
          last_seen_at?: string | null
          location_id?: string
          manual_department?: string | null
          manual_drink_type?: string | null
          manual_type?: string | null
          mapped_dish_id?: string | null
          merged_into_id?: string | null
          needs_review?: boolean
          pos_provider?: string
          restaurant_id?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_pos_items_mapped_dish_id_fkey"
            columns: ["mapped_dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_pos_items_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "external_pos_items"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_pos_product_summaries: {
        Row: {
          created_at: string
          department: string | null
          discount_amount: number
          external_item_id: string
          gross_sales: number
          id: string
          imported_at: string
          item_name: string | null
          location_id: string
          net_sales: number
          period_end: string
          period_label: string | null
          period_start: string
          pos_provider: string
          quantity_sold: number
          restaurant_id: string
          source_file_name: string | null
          updated_at: string
          vat_amount: number
        }
        Insert: {
          created_at?: string
          department?: string | null
          discount_amount?: number
          external_item_id: string
          gross_sales?: number
          id?: string
          imported_at?: string
          item_name?: string | null
          location_id: string
          net_sales?: number
          period_end: string
          period_label?: string | null
          period_start: string
          pos_provider?: string
          quantity_sold?: number
          restaurant_id: string
          source_file_name?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          created_at?: string
          department?: string | null
          discount_amount?: number
          external_item_id?: string
          gross_sales?: number
          id?: string
          imported_at?: string
          item_name?: string | null
          location_id?: string
          net_sales?: number
          period_end?: string
          period_label?: string | null
          period_start?: string
          pos_provider?: string
          quantity_sold?: number
          restaurant_id?: string
          source_file_name?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Relationships: []
      }
      ingredient_prices: {
        Row: {
          base_unit: string | null
          cost_per_base_unit: number | null
          cost_per_pack: number | null
          cost_price: number
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          ingredient_id: string
          note: string | null
          pack_size: number | null
          pack_unit: string | null
          restaurant_id: string | null
          revision: number
          source: string
        }
        Insert: {
          base_unit?: string | null
          cost_per_base_unit?: number | null
          cost_per_pack?: number | null
          cost_price: number
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          ingredient_id: string
          note?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          restaurant_id?: string | null
          revision?: number
          source?: string
        }
        Update: {
          base_unit?: string | null
          cost_per_base_unit?: number | null
          cost_per_pack?: number | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          ingredient_id?: string
          note?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          restaurant_id?: string | null
          revision?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_prices_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_prices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          category: string | null
          cost_per_pack: number | null
          created_at: string
          default_cost_price: number | null
          id: string
          item_group: string | null
          item_type: string
          linked_dish_id: string | null
          name: string
          pack_size: number | null
          pack_unit: string | null
          par_level: number | null
          purchase_unit: string | null
          reorder_point: number | null
          restaurant_id: string | null
          shelf_life_days: number | null
          storage_type: Database["public"]["Enums"]["storage_type"]
          supplier_id: string | null
          unit: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          cost_per_pack?: number | null
          created_at?: string
          default_cost_price?: number | null
          id?: string
          item_group?: string | null
          item_type?: string
          linked_dish_id?: string | null
          name: string
          pack_size?: number | null
          pack_unit?: string | null
          par_level?: number | null
          purchase_unit?: string | null
          reorder_point?: number | null
          restaurant_id?: string | null
          shelf_life_days?: number | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          cost_per_pack?: number | null
          created_at?: string
          default_cost_price?: number | null
          id?: string
          item_group?: string | null
          item_type?: string
          linked_dish_id?: string | null
          name?: string
          pack_size?: number | null
          pack_unit?: string | null
          par_level?: number | null
          purchase_unit?: string | null
          reorder_point?: number | null
          restaurant_id?: string | null
          shelf_life_days?: number | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_linked_dish_id_fkey"
            columns: ["linked_dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          operating_hours: Json | null
          restaurant_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          operating_hours?: Json | null
          restaurant_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          operating_hours?: Json | null
          restaurant_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_dishes: {
        Row: {
          available_from: string | null
          available_to: string | null
          created_at: string
          dish_id: string
          display_order: number
          id: string
          is_active: boolean
          menu_id: string
          price_override: number | null
          restaurant_id: string | null
          section_override: string | null
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          created_at?: string
          dish_id: string
          display_order?: number
          id?: string
          is_active?: boolean
          menu_id: string
          price_override?: number | null
          restaurant_id?: string | null
          section_override?: string | null
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          created_at?: string
          dish_id?: string
          display_order?: number
          id?: string
          is_active?: boolean
          menu_id?: string
          price_override?: number | null
          restaurant_id?: string | null
          section_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_dishes_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_dishes_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_dishes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          days: Json
          end_time: string
          id: string
          location_id: string | null
          name: string
          restaurant_id: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days?: Json
          end_time?: string
          id?: string
          location_id?: string | null
          name: string
          restaurant_id?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: Json
          end_time?: string
          id?: string
          location_id?: string | null
          name?: string
          restaurant_id?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          restaurant_id: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          restaurant_id: string
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          restaurant_id?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      overheads: {
        Row: {
          allocation_details: Json
          allocation_mode: string
          amount: number
          category: string
          cost_type: string | null
          created_at: string
          end_date: string | null
          frequency: string
          id: string
          import_batch_id: string | null
          is_active: boolean
          location_id: string | null
          name: string
          notes: string | null
          restaurant_id: string
          source_category: string | null
          start_date: string | null
          supplier_name: string | null
          updated_at: string
          vat_treatment: string
        }
        Insert: {
          allocation_details?: Json
          allocation_mode?: string
          amount?: number
          category?: string
          cost_type?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          location_id?: string | null
          name: string
          notes?: string | null
          restaurant_id: string
          source_category?: string | null
          start_date?: string | null
          supplier_name?: string | null
          updated_at?: string
          vat_treatment?: string
        }
        Update: {
          allocation_details?: Json
          allocation_mode?: string
          amount?: number
          category?: string
          cost_type?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          location_id?: string | null
          name?: string
          notes?: string | null
          restaurant_id?: string
          source_category?: string | null
          start_date?: string | null
          supplier_name?: string | null
          updated_at?: string
          vat_treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "overheads_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "expense_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overheads_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overheads_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_daily_summaries: {
        Row: {
          average_order_value: number | null
          created_at: string
          discounts: number | null
          gross_sales: number | null
          has_product_detail: boolean
          has_summary_report: boolean
          id: string
          location_id: string | null
          net_sales: number | null
          order_count: number | null
          pos_provider: string
          product_discounts: number | null
          product_gross_sales: number | null
          product_net_sales: number | null
          product_source_file: string | null
          product_vat_amount: number | null
          report_date: string
          restaurant_id: string
          source_file_name: string | null
          summary_discounts: number | null
          summary_gross_sales: number | null
          summary_net_sales: number | null
          summary_source_file: string | null
          summary_vat_amount: number | null
          updated_at: string
          vat_amount: number | null
          visitor_count: number | null
        }
        Insert: {
          average_order_value?: number | null
          created_at?: string
          discounts?: number | null
          gross_sales?: number | null
          has_product_detail?: boolean
          has_summary_report?: boolean
          id?: string
          location_id?: string | null
          net_sales?: number | null
          order_count?: number | null
          pos_provider: string
          product_discounts?: number | null
          product_gross_sales?: number | null
          product_net_sales?: number | null
          product_source_file?: string | null
          product_vat_amount?: number | null
          report_date: string
          restaurant_id: string
          source_file_name?: string | null
          summary_discounts?: number | null
          summary_gross_sales?: number | null
          summary_net_sales?: number | null
          summary_source_file?: string | null
          summary_vat_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          visitor_count?: number | null
        }
        Update: {
          average_order_value?: number | null
          created_at?: string
          discounts?: number | null
          gross_sales?: number | null
          has_product_detail?: boolean
          has_summary_report?: boolean
          id?: string
          location_id?: string | null
          net_sales?: number | null
          order_count?: number | null
          pos_provider?: string
          product_discounts?: number | null
          product_gross_sales?: number | null
          product_net_sales?: number | null
          product_source_file?: string | null
          product_vat_amount?: number | null
          report_date?: string
          restaurant_id?: string
          source_file_name?: string | null
          summary_discounts?: number | null
          summary_gross_sales?: number | null
          summary_net_sales?: number | null
          summary_source_file?: string | null
          summary_vat_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          visitor_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_daily_summaries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_daily_summaries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_integrations: {
        Row: {
          api_key: string | null
          api_secret: string | null
          created_at: string
          id: string
          last_successful_sync_at: string | null
          last_sync_attempt_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          last_sync_time: string | null
          last_test_error: string | null
          last_test_status: string | null
          last_tested_at: string | null
          location_id: string
          pos_provider: string
          restaurant_id: string | null
          settings: Json | null
          status: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          id?: string
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_sync_time?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          location_id: string
          pos_provider: string
          restaurant_id?: string | null
          settings?: Json | null
          status?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          id?: string
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_sync_time?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          location_id?: string
          pos_provider?: string
          restaurant_id?: string | null
          settings?: Json | null
          status?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_integrations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_mappings: {
        Row: {
          confidence_score: number | null
          created_at: string
          external_id: string
          external_name: string | null
          id: string
          internal_id: string | null
          is_verified: boolean | null
          location_id: string
          mapping_type: string
          pos_provider: string
          restaurant_id: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          external_id: string
          external_name?: string | null
          id?: string
          internal_id?: string | null
          is_verified?: boolean | null
          location_id: string
          mapping_type: string
          pos_provider: string
          restaurant_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          external_id?: string
          external_name?: string | null
          id?: string
          internal_id?: string | null
          is_verified?: boolean | null
          location_id?: string
          mapping_type?: string
          pos_provider?: string
          restaurant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_mappings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales_import: {
        Row: {
          created_at: string
          data: Json
          department: string | null
          discount_amount: number | null
          external_item_id: string | null
          external_sale_id: string
          gross_sales: number | null
          id: string
          item_name: string | null
          location_id: string
          mapped_dish_id: string | null
          mapped_quantity: number | null
          mapped_sale_date: string | null
          mapped_total_price: number | null
          net_sales: number | null
          pos_provider: string
          restaurant_id: string | null
          sync_status: string | null
          vat_amount: number | null
        }
        Insert: {
          created_at?: string
          data: Json
          department?: string | null
          discount_amount?: number | null
          external_item_id?: string | null
          external_sale_id: string
          gross_sales?: number | null
          id?: string
          item_name?: string | null
          location_id: string
          mapped_dish_id?: string | null
          mapped_quantity?: number | null
          mapped_sale_date?: string | null
          mapped_total_price?: number | null
          net_sales?: number | null
          pos_provider: string
          restaurant_id?: string | null
          sync_status?: string | null
          vat_amount?: number | null
        }
        Update: {
          created_at?: string
          data?: Json
          department?: string | null
          discount_amount?: number | null
          external_item_id?: string | null
          external_sale_id?: string
          gross_sales?: number | null
          id?: string
          item_name?: string | null
          location_id?: string
          mapped_dish_id?: string | null
          mapped_quantity?: number | null
          mapped_sale_date?: string | null
          mapped_total_price?: number | null
          net_sales?: number | null
          pos_provider?: string
          restaurant_id?: string | null
          sync_status?: string | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_import_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_import_mapped_dish_id_fkey"
            columns: ["mapped_dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_import_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_staff_import: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          data: Json
          external_staff_id: string
          id: string
          location_id: string
          mapped_staff_id: string | null
          pos_provider: string
          restaurant_id: string | null
          sync_status: string | null
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          data: Json
          external_staff_id: string
          id?: string
          location_id: string
          mapped_staff_id?: string | null
          pos_provider: string
          restaurant_id?: string | null
          sync_status?: string | null
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          data?: Json
          external_staff_id?: string
          id?: string
          location_id?: string
          mapped_staff_id?: string | null
          pos_provider?: string
          restaurant_id?: string | null
          sync_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_staff_import_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_import_mapped_staff_id_fkey"
            columns: ["mapped_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_import_mapped_staff_id_fkey"
            columns: ["mapped_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_import_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sync_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          location_id: string
          message: string | null
          pos_provider: string
          restaurant_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          location_id: string
          message?: string | null
          pos_provider: string
          restaurant_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          location_id?: string
          message?: string | null
          pos_provider?: string
          restaurant_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sync_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sync_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          ingredient_id: string
          purchase_order_id: string
          quantity: number
          received_quantity: number | null
          received_unit_cost: number | null
          restaurant_id: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id: string
          purchase_order_id: string
          quantity?: number
          received_quantity?: number | null
          received_unit_cost?: number | null
          restaurant_id?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number | null
          received_unit_cost?: number | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          delivery_date: string | null
          id: string
          location_id: string
          order_date: string
          received_at: string | null
          received_by: string | null
          restaurant_id: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string | null
          id?: string
          location_id: string
          order_date?: string
          received_at?: string | null
          received_by?: string | null
          restaurant_id?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string | null
          id?: string
          location_id?: string
          order_date?: string
          received_at?: string | null
          received_by?: string | null
          restaurant_id?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_customers: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          location_id: string | null
          marketing_opt_in: boolean
          notes: string | null
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          location_id?: string | null
          marketing_opt_in?: boolean
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          location_id?: string | null
          marketing_opt_in?: boolean
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_customers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_sittings: {
        Row: {
          buffer_minutes: number
          created_at: string
          days_of_week: number[]
          default_duration_minutes: number
          end_time: string
          id: string
          is_active: boolean
          location_id: string | null
          max_covers: number | null
          name: string
          restaurant_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          buffer_minutes?: number
          created_at?: string
          days_of_week?: number[]
          default_duration_minutes?: number
          end_time?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          max_covers?: number | null
          name: string
          restaurant_id: string
          start_time?: string
          updated_at?: string
        }
        Update: {
          buffer_minutes?: number
          created_at?: string
          days_of_week?: number[]
          default_duration_minutes?: number
          end_time?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          max_covers?: number | null
          name?: string
          restaurant_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_sittings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_sittings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_tables: {
        Row: {
          area: string | null
          created_at: string
          h: number
          id: string
          is_active: boolean
          location_id: string
          name: string
          restaurant_id: string
          seats: number
          shape: Database["public"]["Enums"]["table_shape"]
          updated_at: string
          w: number
          x: number
          y: number
        }
        Insert: {
          area?: string | null
          created_at?: string
          h?: number
          id?: string
          is_active?: boolean
          location_id: string
          name: string
          restaurant_id: string
          seats?: number
          shape?: Database["public"]["Enums"]["table_shape"]
          updated_at?: string
          w?: number
          x?: number
          y?: number
        }
        Update: {
          area?: string | null
          created_at?: string
          h?: number
          id?: string
          is_active?: boolean
          location_id?: string
          name?: string
          restaurant_id?: string
          seats?: number
          shape?: Database["public"]["Enums"]["table_shape"]
          updated_at?: string
          w?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_tables_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          actual_spend: number | null
          arrived_at: string | null
          cancellation_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          decline_reason: string | null
          end_at: string
          id: string
          location_id: string
          party_size: number
          restaurant_id: string
          seated_at: string | null
          sitting_id: string | null
          source: Database["public"]["Enums"]["reservation_source"]
          special_requests: string | null
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          table_ids: Json
          updated_at: string
        }
        Insert: {
          actual_spend?: number | null
          arrived_at?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decline_reason?: string | null
          end_at: string
          id?: string
          location_id: string
          party_size?: number
          restaurant_id: string
          seated_at?: string | null
          sitting_id?: string | null
          source?: Database["public"]["Enums"]["reservation_source"]
          special_requests?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_ids?: Json
          updated_at?: string
        }
        Update: {
          actual_spend?: number | null
          arrived_at?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decline_reason?: string | null
          end_at?: string
          id?: string
          location_id?: string
          party_size?: number
          restaurant_id?: string
          seated_at?: string | null
          sitting_id?: string | null
          source?: Database["public"]["Enums"]["reservation_source"]
          special_requests?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_ids?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reservation_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_sitting_id_fkey"
            columns: ["sitting_id"]
            isOneToOne: false
            referencedRelation: "reservation_sittings"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          location_id: string | null
          location_ids: string[] | null
          restaurant_id: string
          role: string
          role_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          location_id?: string | null
          location_ids?: string[] | null
          restaurant_id: string
          role?: string
          role_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          location_id?: string | null
          location_ids?: string[] | null
          restaurant_id?: string
          role?: string
          role_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_invites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_invites_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean | null
          name: string
          permissions: Json
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name: string
          permissions?: Json
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name?: string
          permissions?: Json
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          dish_id: string
          id: string
          location_id: string
          pos_import_id: string | null
          quantity: number
          restaurant_id: string | null
          sale_date: string
          source: string
          total_price: number
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          location_id: string
          pos_import_id?: string | null
          quantity?: number
          restaurant_id?: string | null
          sale_date?: string
          source?: string
          total_price?: number
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          location_id?: string
          pos_import_id?: string | null
          quantity?: number
          restaurant_id?: string | null
          sale_date?: string
          source?: string
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          annual_salary: number | null
          captiva_operator_code: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          department: string | null
          email: string | null
          first_name: string
          hourly_rate: number
          id: string
          last_name: string
          location_id: string | null
          max_hours_per_week: number
          min_hours_per_week: number | null
          pay_type: Database["public"]["Enums"]["pay_type"]
          phone: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
        }
        Insert: {
          annual_salary?: number | null
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          department?: string | null
          email?: string | null
          first_name: string
          hourly_rate?: number
          id?: string
          last_name: string
          location_id?: string | null
          max_hours_per_week?: number
          min_hours_per_week?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"]
          phone?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
        }
        Update: {
          annual_salary?: number | null
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          department?: string | null
          email?: string | null
          first_name?: string
          hourly_rate?: number
          id?: string
          last_name?: string
          location_id?: string | null
          max_hours_per_week?: number
          min_hours_per_week?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"]
          phone?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          clock_in: string
          clock_out: string | null
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          id: string
          is_corrected: boolean
          location_id: string
          original_clock_in: string | null
          original_clock_out: string | null
          original_source: string | null
          restaurant_id: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          staff_id: string
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          id?: string
          is_corrected?: boolean
          location_id: string
          original_clock_in?: string | null
          original_clock_out?: string | null
          original_source?: string | null
          restaurant_id?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          staff_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          id?: string
          is_corrected?: boolean
          location_id?: string
          original_clock_in?: string | null
          original_clock_out?: string | null
          original_source?: string | null
          restaurant_id?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_performance: {
        Row: {
          created_at: string
          date: string
          id: string
          kpi_customers_served: number
          kpi_errors: number
          kpi_sales: number
          restaurant_id: string | null
          score: number | null
          staff_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          kpi_customers_served?: number
          kpi_errors?: number
          kpi_sales?: number
          restaurant_id?: string | null
          score?: number | null
          staff_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          kpi_customers_served?: number
          kpi_errors?: number
          kpi_sales?: number
          restaurant_id?: string | null
          score?: number | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_performance_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string
          id: string
          is_draft: boolean
          location_id: string
          notes: string | null
          restaurant_id: string | null
          shift_end: string
          shift_start: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_draft?: boolean
          location_id: string
          notes?: string | null
          restaurant_id?: string | null
          shift_end: string
          shift_start: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_draft?: boolean
          location_id?: string
          notes?: string | null
          restaurant_id?: string | null
          shift_end?: string
          shift_start?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjusted_by: string | null
          adjustment_type: string
          count_id: string | null
          created_at: string
          effective_date: string | null
          id: string
          ingredient_id: string
          location_id: string
          movement_id: string | null
          quantity: number
          reason: string | null
          restaurant_id: string | null
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_type: string
          count_id?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          ingredient_id: string
          location_id: string
          movement_id?: string | null
          quantity: number
          reason?: string | null
          restaurant_id?: string | null
        }
        Update: {
          adjusted_by?: string | null
          adjustment_type?: string
          count_id?: string | null
          created_at?: string
          effective_date?: string | null
          id?: string
          ingredient_id?: string
          location_id?: string
          movement_id?: string | null
          quantity?: number
          reason?: string | null
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_lines: {
        Row: {
          count_id: string
          counted_quantity: number
          created_at: string
          difference: number
          expected_quantity: number
          id: string
          ingredient_id: string
          location_id: string
          restaurant_id: string
        }
        Insert: {
          count_id: string
          counted_quantity: number
          created_at?: string
          difference?: number
          expected_quantity?: number
          id?: string
          ingredient_id: string
          location_id: string
          restaurant_id: string
        }
        Update: {
          count_id?: string
          counted_quantity?: number
          created_at?: string
          difference?: number
          expected_quantity?: number
          id?: string
          ingredient_id?: string
          location_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          count_date: string
          created_at: string
          effective_at: string | null
          id: string
          location_id: string
          notes: string | null
          restaurant_id: string
          scope_type: string
          scope_value: string | null
          status: string
          submitted_at: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          count_date?: string
          created_at?: string
          effective_at?: string | null
          id?: string
          location_id: string
          notes?: string | null
          restaurant_id: string
          scope_type?: string
          scope_value?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          updated_at?: string
        }
        Update: {
          count_date?: string
          created_at?: string
          effective_at?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          restaurant_id?: string
          scope_type?: string
          scope_value?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          id: string
          ingredient_id: string
          location_id: string
          quantity: number
          restaurant_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          location_id: string
          quantity?: number
          restaurant_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          location_id?: string
          quantity?: number
          restaurant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          anchor_count_id: string | null
          cost_source: string
          created_at: string
          created_by: string | null
          effective_at: string
          effective_date: string
          id: string
          ingredient_id: string
          location_id: string
          movement_type: string
          quantity: number
          reason: string | null
          rebase_of_movement_id: string | null
          restaurant_id: string
          reverses_movement_id: string | null
          source_id: string | null
          source_line_id: string | null
          source_type: string
          unit_cost: number | null
        }
        Insert: {
          anchor_count_id?: string | null
          cost_source: string
          created_at?: string
          created_by?: string | null
          effective_at: string
          effective_date: string
          id?: string
          ingredient_id: string
          location_id: string
          movement_type: string
          quantity: number
          reason?: string | null
          rebase_of_movement_id?: string | null
          restaurant_id: string
          reverses_movement_id?: string | null
          source_id?: string | null
          source_line_id?: string | null
          source_type: string
          unit_cost?: number | null
        }
        Update: {
          anchor_count_id?: string | null
          cost_source?: string
          created_at?: string
          created_by?: string | null
          effective_at?: string
          effective_date?: string
          id?: string
          ingredient_id?: string
          location_id?: string
          movement_type?: string
          quantity?: number
          reason?: string | null
          rebase_of_movement_id?: string | null
          restaurant_id?: string
          reverses_movement_id?: string | null
          source_id?: string | null
          source_line_id?: string | null
          source_type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_rebase_of_movement_id_fkey"
            columns: ["rebase_of_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_movement_id_fkey"
            columns: ["reverses_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          ingredient_id: string | null
          invoice_id: string
          is_stock: boolean
          line_no: number
          line_total: number | null
          match_status: string
          pack_size: number | null
          pack_unit: string | null
          product_code: string | null
          quantity: number | null
          restaurant_id: string
          stock_quantity: number | null
          supplier_product_id: string | null
          unit_price: number | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          ingredient_id?: string | null
          invoice_id: string
          is_stock?: boolean
          line_no: number
          line_total?: number | null
          match_status?: string
          pack_size?: number | null
          pack_unit?: string | null
          product_code?: string | null
          quantity?: number | null
          restaurant_id: string
          stock_quantity?: number | null
          supplier_product_id?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          ingredient_id?: string | null
          invoice_id?: string
          is_stock?: boolean
          line_no?: number
          line_total?: number | null
          match_status?: string
          pack_size?: number | null
          pack_unit?: string | null
          product_code?: string | null
          quantity?: number | null
          restaurant_id?: string
          stock_quantity?: number | null
          supplier_product_id?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_lines_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          credits_invoice_id: string | null
          doc_type: string
          document_id: string | null
          due_date: string | null
          expense_class: string
          gross_amount: number
          id: string
          invoice_date: string
          invoice_number: string
          location_id: string
          net_amount: number | null
          notes: string | null
          purchase_order_id: string | null
          restaurant_id: string
          status: string
          supplier_id: string
          updated_at: string
          vat_amount: number | null
          verified_at: string | null
          verified_by: string | null
          void_reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credits_invoice_id?: string | null
          doc_type?: string
          document_id?: string | null
          due_date?: string | null
          expense_class?: string
          gross_amount: number
          id?: string
          invoice_date: string
          invoice_number: string
          location_id: string
          net_amount?: number | null
          notes?: string | null
          purchase_order_id?: string | null
          restaurant_id: string
          status?: string
          supplier_id: string
          updated_at?: string
          vat_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
          void_reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credits_invoice_id?: string | null
          doc_type?: string
          document_id?: string | null
          due_date?: string | null
          expense_class?: string
          gross_amount?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          location_id?: string
          net_amount?: number | null
          notes?: string | null
          purchase_order_id?: string | null
          restaurant_id?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          vat_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_credits_invoice_id_fkey"
            columns: ["credits_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
          restaurant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
          restaurant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          notes: string | null
          payment_date: string
          reference: string | null
          restaurant_id: string
          status: string
          supplier_id: string
          void_reason: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          payment_date: string
          reference?: string | null
          restaurant_id: string
          status?: string
          supplier_id: string
          void_reason?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          payment_date?: string
          reference?: string | null
          restaurant_id?: string
          status?: string
          supplier_id?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_prices: {
        Row: {
          base_unit: string
          cost_per_base_unit: number
          cost_per_pack: number
          created_at: string
          created_by: string | null
          document_id: string | null
          effective_date: string
          id: string
          note: string | null
          pack_size: number
          pack_unit: string
          purchase_order_id: string | null
          restaurant_id: string
          source: string
          supersedes_id: string | null
          supplier_product_id: string
        }
        Insert: {
          base_unit: string
          cost_per_base_unit: number
          cost_per_pack: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          effective_date: string
          id?: string
          note?: string | null
          pack_size: number
          pack_unit: string
          purchase_order_id?: string | null
          restaurant_id: string
          source: string
          supersedes_id?: string | null
          supplier_product_id: string
        }
        Update: {
          base_unit?: string
          cost_per_base_unit?: number
          cost_per_pack?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          effective_date?: string
          id?: string
          note?: string | null
          pack_size?: number
          pack_unit?: string
          purchase_order_id?: string | null
          restaurant_id?: string
          source?: string
          supersedes_id?: string | null
          supplier_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_prices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_prices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_prices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_prices_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "supplier_product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_prices_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
          normalized_name: string
          pack_size: number | null
          pack_unit: string | null
          product_code: string | null
          product_name: string
          purchase_unit: string | null
          restaurant_id: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id: string
          normalized_name: string
          pack_size?: number | null
          pack_unit?: string | null
          product_code?: string | null
          product_name: string
          purchase_unit?: string | null
          restaurant_id: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id?: string
          normalized_name?: string
          pack_size?: number | null
          pack_unit?: string | null
          product_code?: string | null
          product_name?: string
          purchase_unit?: string | null
          restaurant_id?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_statement_lines: {
        Row: {
          amount: number
          created_at: string
          id: string
          line_date: string | null
          line_type: string
          match_status: string
          matched_invoice_id: string | null
          matched_payment_id: string | null
          reference: string | null
          restaurant_id: string
          statement_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          line_date?: string | null
          line_type: string
          match_status?: string
          matched_invoice_id?: string | null
          matched_payment_id?: string | null
          reference?: string | null
          restaurant_id: string
          statement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          line_date?: string | null
          line_type?: string
          match_status?: string
          matched_invoice_id?: string | null
          matched_payment_id?: string | null
          reference?: string | null
          restaurant_id?: string
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_statement_lines_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_statement_lines_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_statement_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "supplier_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_statements: {
        Row: {
          closing_balance: number
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          restaurant_id: string
          statement_date: string
          supplier_id: string
        }
        Insert: {
          closing_balance: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          restaurant_id: string
          statement_date: string
          supplier_id: string
        }
        Update: {
          closing_balance?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          restaurant_id?: string
          statement_date?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_statements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_statements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_statements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          restaurant_id: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          restaurant_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          restaurant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_backups: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string | null
          error_message: string | null
          file_path: string | null
          id: string
          notes: string | null
          restaurant_id: string
          size_bytes: number | null
          status: string
        }
        Insert: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          restaurant_id: string
          size_bytes?: number | null
          status?: string
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          restaurant_id?: string
          size_bytes?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_backups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_location_access: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_location_access_location_fk"
            columns: ["location_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "user_location_access_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_restaurants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean | null
          restaurant_id: string
          role: string
          role_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          restaurant_id: string
          role?: string
          role_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          restaurant_id?: string
          role?: string
          role_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_restaurants_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_restaurants_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pos_integrations_safe: {
        Row: {
          created_at: string | null
          has_api_key: boolean | null
          has_api_secret: boolean | null
          id: string | null
          last_successful_sync_at: string | null
          last_sync_attempt_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          last_sync_time: string | null
          last_test_error: string | null
          last_test_status: string | null
          last_tested_at: string | null
          location_id: string | null
          pos_provider: string | null
          restaurant_id: string | null
          settings: Json | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string | null
          has_api_key?: never
          has_api_secret?: never
          id?: string | null
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_sync_time?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          location_id?: string | null
          pos_provider?: string | null
          restaurant_id?: string | null
          settings?: never
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string | null
          has_api_key?: never
          has_api_secret?: never
          id?: string | null
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_sync_time?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          location_id?: string | null
          pos_provider?: string | null
          restaurant_id?: string | null
          settings?: never
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_integrations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_safe: {
        Row: {
          annual_salary: number | null
          captiva_operator_code: string | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          created_at: string | null
          department: string | null
          email: string | null
          first_name: string | null
          hourly_rate: number | null
          id: string | null
          last_name: string | null
          location_id: string | null
          max_hours_per_week: number | null
          min_hours_per_week: number | null
          pay_type: Database["public"]["Enums"]["pay_type"] | null
          phone: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["staff_role"] | null
          status: Database["public"]["Enums"]["staff_status"] | null
          updated_at: string | null
        }
        Insert: {
          annual_salary?: never
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          department?: string | null
          email?: never
          first_name?: string | null
          hourly_rate?: never
          id?: string | null
          last_name?: string | null
          location_id?: string | null
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"] | null
          phone?: never
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"] | null
          status?: Database["public"]["Enums"]["staff_status"] | null
          updated_at?: string | null
        }
        Update: {
          annual_salary?: never
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          department?: string | null
          email?: never
          first_name?: string | null
          hourly_rate?: never
          id?: string | null
          last_name?: string | null
          location_id?: string | null
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"] | null
          phone?: never
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"] | null
          status?: Database["public"]["Enums"]["staff_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _insert_actual_payroll: {
        Args: {
          p_amount: number
          p_batch_id: string
          p_document_id: string
          p_label: string
          p_location_id: string
          p_period_month: string
          p_reason: string
          p_replace_id: string
          p_restaurant_id: string
          p_scope: string
          p_scope_note: string
          p_source: string
        }
        Returns: string
      }
      add_ingredient_price: {
        Args: {
          p_cost_per_pack?: number
          p_effective_date: string
          p_ingredient_id: string
          p_note?: string
          p_pack_size?: number
          p_pack_unit?: string
          p_unit_cost?: number
        }
        Returns: string
      }
      apply_expense_import: {
        Args: { p_import: Json; p_restaurant_id: string; p_rows: Json }
        Returns: Json
      }
      apply_stock_list_import: { Args: { p_payload: Json }; Returns: Json }
      assert_day_open: {
        Args: { _date: string; _location_id: string; _restaurant_id: string }
        Returns: undefined
      }
      assert_dish_access: { Args: { p_dish_id: string }; Returns: undefined }
      calculate_dish_cost: { Args: { p_dish_id: string }; Returns: number }
      calculate_dish_cost_at_date: {
        Args: { p_date: string; p_dish_id: string }
        Returns: {
          cost: number
          status: string
        }[]
      }
      calculate_dish_margin: { Args: { p_dish_id: string }; Returns: number }
      calculate_staff_score: {
        Args: { p_date: string; p_staff_id: string }
        Returns: number
      }
      can_edit_inventory: { Args: never; Returns: boolean }
      confirm_statement_match: {
        Args: { p_invoice_id: string; p_line_id: string; p_payment_id: string }
        Returns: undefined
      }
      convert_linked_recipe: { Args: { p_dish_id: string }; Returns: number }
      convert_recipe_qty: {
        Args: { p_ingredient_id: string; p_quantity: number; p_unit: string }
        Returns: number
      }
      correct_supplier_product_price: {
        Args: { p_cost_per_pack: number; p_note: string; p_price_id: string }
        Returns: string
      }
      create_default_automation_rules: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      create_default_roles: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      create_notification: {
        Args: {
          p_message: string
          p_metadata?: Json
          p_restaurant_id: string
          p_title: string
          p_type?: string
          p_user_id?: string
        }
        Returns: string
      }
      day_is_closed: {
        Args: { _date: string; _location_id: string; _restaurant_id: string }
        Returns: boolean
      }
      delete_or_archive_ingredient: {
        Args: { p_ingredient_id: string }
        Returns: string
      }
      ensure_user_restaurant: { Args: never; Returns: Json }
      expense_dedupe_key: {
        Args: { p_amount: number; p_description: string; p_supplier: string }
        Returns: string
      }
      expense_finance_guard: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      expense_jamount: {
        Args: { p_label: string; p_v: string }
        Returns: number
      }
      expense_jdate: {
        Args: { p_field: string; p_label: string; p_v: string }
        Returns: string
      }
      expense_location_guard: {
        Args: {
          p_label: string
          p_location_id: string
          p_restaurant_id: string
        }
        Returns: undefined
      }
      expense_supplier_key: { Args: { p_supplier: string }; Returns: string }
      expire_stale_invites: { Args: { _email: string }; Returns: number }
      finance_guard: {
        Args: { p_payments?: boolean; p_restaurant_id: string }
        Returns: undefined
      }
      get_daily_food_cost: {
        Args: {
          p_end: string
          p_estimate_pct?: number
          p_location_id: string
          p_start: string
        }
        Returns: {
          actual_food_cost: number
          blended_food_cost: number
          estimated_food_cost: number
          fallback_food_cost: number
          fallback_priced_dishes: number
          fallback_quantity: number
          fallback_revenue: number
          food_cost_pct: number
          historical_coverage_pct: number
          historical_food_cost: number
          historical_quantity: number
          historical_revenue: number
          missing_cost_dishes: number
          recipe_coverage_pct: number
          sale_date: string
          total_revenue: number
          uncosted_quantity: number
          uncosted_revenue: number
        }[]
      }
      get_ingredient_base_cost: {
        Args: { p_ingredient_id: string }
        Returns: number
      }
      get_ingredient_cost_at_date: {
        Args: { p_date: string; p_ingredient_id: string }
        Returns: {
          cost: number
          is_historical: boolean
        }[]
      }
      get_ingredient_cost_unit: {
        Args: { p_ingredient_id: string }
        Returns: string
      }
      get_latest_ingredient_price: {
        Args: { p_ingredient_id: string }
        Returns: number
      }
      get_period_actual_food_cost: {
        Args: {
          p_end: string
          p_location_id: string
          p_restaurant_id: string
          p_start: string
        }
        Returns: Json
      }
      get_period_food_cost: {
        Args: {
          p_end: string
          p_estimate_pct?: number
          p_location_id: string
          p_start: string
        }
        Returns: {
          actual_food_cost: number
          blended_food_cost: number
          estimated_food_cost: number
          fallback_food_cost: number
          fallback_priced_dishes: number
          fallback_quantity: number
          fallback_revenue: number
          food_cost_pct: number
          historical_coverage_pct: number
          historical_food_cost: number
          historical_quantity: number
          historical_revenue: number
          missing_cost_dishes: number
          recipe_coverage_pct: number
          total_revenue: number
          uncosted_quantity: number
          uncosted_revenue: number
        }[]
      }
      get_supplier_cashflow: {
        Args: { p_end: string; p_restaurant_id: string; p_start: string }
        Returns: Json
      }
      get_theoretical_usage: {
        Args: { p_end?: string; p_location_id?: string; p_start?: string }
        Returns: {
          base_unit: string
          cost: number
          dishes_sold: number
          ingredient_id: string
          ingredient_name: string
          quantity_used: number
          usage_source: string
        }[]
      }
      get_theoretical_usage_impl: {
        Args: { p_end?: string; p_location_id?: string; p_start?: string }
        Returns: {
          base_unit: string
          cost: number
          dishes_sold: number
          ingredient_id: string
          ingredient_name: string
          quantity_used: number
          usage_source: string
        }[]
      }
      get_user_location_ids: { Args: never; Returns: string[] }
      get_user_permissions: { Args: never; Returns: Json }
      get_user_restaurant_id: { Args: never; Returns: string }
      get_user_role_id: { Args: never; Returns: string }
      import_jnum:
        | { Args: { _j: Json; _k: string }; Returns: number }
        | { Args: { _v: Json }; Returns: number }
      import_juuid:
        | { Args: { _j: Json; _k: string }; Returns: string }
        | { Args: { _v: Json }; Returns: string }
      ingredient_cost_class: {
        Args: { p_category: string; p_group: string; p_type: string }
        Returns: string
      }
      ingredient_dependencies: {
        Args: { p_ingredient_id: string }
        Returns: Json
      }
      insert_ingredient_price_row: {
        Args: {
          p_cost_per_base_unit: number
          p_cost_per_pack: number
          p_cost_price: number
          p_created_by?: string
          p_effective_date: string
          p_ingredient_id: string
          p_note?: string
          p_pack_size: number
          p_pack_unit: string
          p_source: string
        }
        Returns: string
      }
      invoice_outstanding: { Args: { p_invoice_id: string }; Returns: number }
      is_trusted_backend_session: { Args: never; Returns: boolean }
      ledger_apply_movement: {
        Args: {
          p_at: string
          p_cost_source: string
          p_ingredient_id: string
          p_location_id: string
          p_own_count_id?: string
          p_qty: number
          p_reason: string
          p_restaurant_id: string
          p_reverses: string
          p_source_id: string
          p_source_line_id: string
          p_source_type: string
          p_type: string
          p_unit_cost: number
        }
        Returns: string
      }
      ledger_balance_at: {
        Args: { p_at: string; p_ingredient_id: string; p_location_id: string }
        Returns: number
      }
      ledger_effective_at: {
        Args: { p_date: string; p_end_of_day?: boolean }
        Returns: string
      }
      ledger_guard: {
        Args: { p_date: string; p_location_id: string; p_restaurant_id: string }
        Returns: undefined
      }
      ledger_stock_unit_cost: {
        Args: { p_date: string; p_ingredient_id: string }
        Returns: number
      }
      link_invoice_receipt: {
        Args: { p_invoice_id: string; p_purchase_order_id: string }
        Returns: undefined
      }
      log_audit_event: {
        Args: {
          p_data?: Json
          p_description: string
          p_event_type: string
          p_restaurant_id: string
        }
        Returns: string
      }
      merge_dishes: {
        Args: {
          p_duplicate_id: string
          p_master_id: string
          p_use_duplicate_category?: boolean
          p_use_duplicate_name?: boolean
          p_use_duplicate_price?: boolean
          p_use_duplicate_recipe?: boolean
        }
        Returns: Json
      }
      normalize_unit: { Args: { _u: string }; Returns: string }
      operating_day: {
        Args: { _location_id: string; _ts: string }
        Returns: string
      }
      preview_supplier_products: {
        Args: { p_rows: Json }
        Returns: {
          existing_code: string
          existing_ingredient_id: string
          existing_name: string
          existing_pack_size: number
          existing_pack_unit: string
          row_no: number
          status: string
          supplier_product_id: string
        }[]
      }
      receive_direct_delivery: {
        Args: {
          p_delivery_date: string
          p_lines: Json
          p_location_id: string
          p_supplier_id: string
        }
        Returns: string
      }
      receive_invoice_goods: {
        Args: { p_delivery_date: string; p_invoice_id: string }
        Returns: string
      }
      receive_purchase_order: {
        Args: {
          p_delivery_date: string
          p_lines: Json
          p_purchase_order_id: string
        }
        Returns: string
      }
      recipe_lines_for_dish: {
        Args: { p_dish_id: string }
        Returns: {
          cost_mode: string
          factor: number
          ingredient_id: string
          line_id: string
          manual_cost_effective_from: string
          manual_line_cost: number
          quantity: number
          source_dish_id: string
          unit: string
        }[]
      }
      recipe_qty_in_stock_unit: {
        Args: { p_ingredient_id: string; p_quantity: number; p_unit: string }
        Returns: number
      }
      reconcile_supplier_statement: {
        Args: { p_statement_id: string }
        Returns: Json
      }
      record_actual_payroll: {
        Args: {
          p_amount: number
          p_change_reason?: string
          p_document_id?: string
          p_location_id: string
          p_period_month: string
          p_replace_payroll_id?: string
          p_restaurant_id: string
          p_scope: string
          p_scope_note?: string
        }
        Returns: string
      }
      record_stock_adjustment: {
        Args: {
          p_adjustment_type: string
          p_effective_date: string
          p_ingredient_id: string
          p_location_id: string
          p_quantity: number
          p_reason?: string
        }
        Returns: string
      }
      record_supplier_payment: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_method: string
          p_payment_date: string
          p_reference: string
          p_supplier_id: string
        }
        Returns: string
      }
      remove_dish_category: {
        Args: { p_id: string; p_move_to?: string }
        Returns: Json
      }
      rename_dish_category: {
        Args: { p_id: string; p_merge?: boolean; p_new_name: string }
        Returns: Json
      }
      restaurant_has_members: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
      reverse_stock_movement: {
        Args: { p_movement_id: string; p_reason: string }
        Returns: string
      }
      save_supplier_invoice_draft: {
        Args: { p_invoice: Json; p_lines: Json }
        Returns: string
      }
      save_supplier_statement: {
        Args: {
          p_closing_balance: number
          p_document_id: string
          p_lines: Json
          p_period_end: string
          p_period_start: string
          p_statement_date: string
          p_supplier_id: string
        }
        Returns: string
      }
      set_initial_import_price: {
        Args: {
          p_cost_per_pack: number
          p_ingredient_id: string
          p_pack_size: number
          p_pack_unit: string
          p_unit_cost: number
        }
        Returns: undefined
      }
      set_stock_quantity: {
        Args: {
          p_ingredient_id: string
          p_location_id: string
          p_new_quantity: number
          p_reason?: string
        }
        Returns: string
      }
      set_supplier_product_archived: {
        Args: { p_archived: boolean; p_id: string }
        Returns: undefined
      }
      stock_ledger_drift: {
        Args: { p_restaurant_id: string }
        Returns: {
          ingredient_id: string
          ledger_total: number
          location_id: string
          stock_level: number
        }[]
      }
      storage_doc_extension_allowed: {
        Args: { _name: string }
        Returns: boolean
      }
      storage_doc_restaurant_id: { Args: { _name: string }; Returns: string }
      submit_stock_count: {
        Args: {
          p_count_date: string
          p_lines: Json
          p_location_id: string
          p_notes: string
          p_scope_type: string
          p_scope_value: string
        }
        Returns: string
      }
      supplier_cost_per_base: {
        Args: { _cost: number; _size: number; _unit: string }
        Returns: number
      }
      supplier_name_key: { Args: { _s: string }; Returns: string }
      sync_own_profile: { Args: never; Returns: undefined }
      tenant_filter: { Args: { _restaurant_id: string }; Returns: boolean }
      unit_factor: { Args: { _u: string }; Returns: number }
      upsert_pos_daily_summary: {
        Args: {
          p_average_order_value?: number
          p_discounts?: number
          p_gross?: number
          p_location_id: string
          p_net?: number
          p_order_count?: number
          p_pos_provider: string
          p_report_date: string
          p_report_kind: string
          p_restaurant_id: string
          p_source_file?: string
          p_vat?: number
          p_visitor_count?: number
        }
        Returns: {
          average_order_value: number | null
          created_at: string
          discounts: number | null
          gross_sales: number | null
          has_product_detail: boolean
          has_summary_report: boolean
          id: string
          location_id: string | null
          net_sales: number | null
          order_count: number | null
          pos_provider: string
          product_discounts: number | null
          product_gross_sales: number | null
          product_net_sales: number | null
          product_source_file: string | null
          product_vat_amount: number | null
          report_date: string
          restaurant_id: string
          source_file_name: string | null
          summary_discounts: number | null
          summary_gross_sales: number | null
          summary_net_sales: number | null
          summary_source_file: string | null
          summary_vat_amount: number | null
          updated_at: string
          vat_amount: number | null
          visitor_count: number | null
        }
        SetofOptions: {
          from: "*"
          to: "pos_daily_summaries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_belongs_to_restaurant: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
      user_can_access_location: {
        Args: { _location_id: string }
        Returns: boolean
      }
      user_can_access_location_or_global: {
        Args: { _location_id: string }
        Returns: boolean
      }
      user_can_view_pos_credentials: { Args: never; Returns: boolean }
      user_has_permission: {
        Args: { p_action: string; p_resource: string }
        Returns: boolean
      }
      user_has_pos_admin: { Args: never; Returns: boolean }
      user_is_manager_or_owner: { Args: never; Returns: boolean }
      user_is_owner: { Args: never; Returns: boolean }
      verify_supplier_invoice: {
        Args: { p_invoice_id: string; p_record_supplier_prices?: boolean }
        Returns: Json
      }
      void_actual_expense: {
        Args: { p_expense_id: string; p_reason: string }
        Returns: undefined
      }
      void_actual_payroll: {
        Args: { p_payroll_id: string; p_reason: string }
        Returns: undefined
      }
      void_supplier_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
      void_supplier_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      attendance_source: "manual" | "pos" | "auto"
      contract_type: "full_time" | "part_time" | "casual"
      pay_type: "hourly" | "salary"
      reservation_source: "phone" | "walk_in" | "online" | "staff"
      reservation_status:
        | "inquiry"
        | "pending"
        | "confirmed"
        | "arrived"
        | "declined"
        | "cancelled"
        | "seated"
        | "completed"
        | "no_show"
      staff_role:
        | "chef"
        | "waiter"
        | "manager"
        | "host"
        | "bartender"
        | "kitchen_assistant"
        | "cleaner"
      staff_status: "active" | "inactive" | "on_leave"
      storage_type: "freezer" | "fridge" | "dry"
      table_shape: "square" | "circle" | "rect"
      unit_type: "kg" | "g" | "L" | "ml" | "oz" | "each"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attendance_source: ["manual", "pos", "auto"],
      contract_type: ["full_time", "part_time", "casual"],
      pay_type: ["hourly", "salary"],
      reservation_source: ["phone", "walk_in", "online", "staff"],
      reservation_status: [
        "inquiry",
        "pending",
        "confirmed",
        "arrived",
        "declined",
        "cancelled",
        "seated",
        "completed",
        "no_show",
      ],
      staff_role: [
        "chef",
        "waiter",
        "manager",
        "host",
        "bartender",
        "kitchen_assistant",
        "cleaner",
      ],
      staff_status: ["active", "inactive", "on_leave"],
      storage_type: ["freezer", "fridge", "dry"],
      table_shape: ["square", "circle", "rect"],
      unit_type: ["kg", "g", "L", "ml", "oz", "each"],
    },
  },
} as const
