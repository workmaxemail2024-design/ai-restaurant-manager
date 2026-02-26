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
      daily_ledger_entries: {
        Row: {
          additional_expenses: number | null
          covers: number | null
          covers_unknown: boolean
          created_at: string
          entry_date: string
          id: string
          is_closed: boolean
          labour_hours: number | null
          location_id: string | null
          manual_orders: number | null
          manual_revenue: number | null
          notes: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          additional_expenses?: number | null
          covers?: number | null
          covers_unknown?: boolean
          created_at?: string
          entry_date: string
          id?: string
          is_closed?: boolean
          labour_hours?: number | null
          location_id?: string | null
          manual_orders?: number | null
          manual_revenue?: number | null
          notes?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          additional_expenses?: number | null
          covers?: number | null
          covers_unknown?: boolean
          created_at?: string
          entry_date?: string
          id?: string
          is_closed?: boolean
          labour_hours?: number | null
          location_id?: string | null
          manual_orders?: number | null
          manual_revenue?: number | null
          notes?: string | null
          restaurant_id?: string
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
      dish_ingredients: {
        Row: {
          created_at: string
          dish_id: string
          id: string
          ingredient_id: string
          quantity: number
          restaurant_id: string | null
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          ingredient_id: string
          quantity?: number
          restaurant_id?: string | null
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          ingredient_id?: string
          quantity?: number
          restaurant_id?: string | null
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
          captiva_external_id: string | null
          category: string | null
          created_at: string
          id: string
          location_id: string | null
          name: string
          restaurant_id: string | null
          selling_price: number
          updated_at: string
        }
        Insert: {
          captiva_external_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          restaurant_id?: string | null
          selling_price?: number
          updated_at?: string
        }
        Update: {
          captiva_external_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          restaurant_id?: string | null
          selling_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dishes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
      ingredient_prices: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          ingredient_id: string
          restaurant_id: string | null
        }
        Insert: {
          cost_price: number
          created_at?: string
          id?: string
          ingredient_id: string
          restaurant_id?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          restaurant_id?: string | null
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
          cost_per_pack: number | null
          created_at: string
          default_cost_price: number
          id: string
          name: string
          pack_size: number | null
          pack_unit: string | null
          purchase_unit: string | null
          restaurant_id: string | null
          storage_type: Database["public"]["Enums"]["storage_type"]
          supplier_id: string | null
          unit: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          cost_per_pack?: number | null
          created_at?: string
          default_cost_price?: number
          id?: string
          name: string
          pack_size?: number | null
          pack_unit?: string | null
          purchase_unit?: string | null
          restaurant_id?: string | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          cost_per_pack?: number | null
          created_at?: string
          default_cost_price?: number
          id?: string
          name?: string
          pack_size?: number | null
          pack_unit?: string | null
          purchase_unit?: string | null
          restaurant_id?: string | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: [
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
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          operating_hours?: Json | null
          restaurant_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          operating_hours?: Json | null
          restaurant_id?: string | null
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
          created_at: string
          dish_id: string
          id: string
          menu_id: string
          restaurant_id: string | null
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          menu_id: string
          restaurant_id?: string | null
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          menu_id?: string
          restaurant_id?: string | null
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
          amount: number
          category: string
          created_at: string
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          restaurant_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          restaurant_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          restaurant_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
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
      pos_integrations: {
        Row: {
          api_key: string | null
          api_secret: string | null
          created_at: string
          id: string
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
          external_sale_id: string | null
          id: string
          location_id: string
          mapped_dish_id: string | null
          mapped_quantity: number | null
          mapped_sale_date: string | null
          mapped_total_price: number | null
          pos_provider: string
          restaurant_id: string | null
          sync_status: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          external_sale_id?: string | null
          id?: string
          location_id: string
          mapped_dish_id?: string | null
          mapped_quantity?: number | null
          mapped_sale_date?: string | null
          mapped_total_price?: number | null
          pos_provider: string
          restaurant_id?: string | null
          sync_status?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          external_sale_id?: string | null
          id?: string
          location_id?: string
          mapped_dish_id?: string | null
          mapped_quantity?: number | null
          mapped_sale_date?: string | null
          mapped_total_price?: number | null
          pos_provider?: string
          restaurant_id?: string | null
          sync_status?: string | null
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
      purchase_order_items: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          ingredient_id: string
          purchase_order_id: string
          quantity: number
          restaurant_id: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id: string
          purchase_order_id: string
          quantity?: number
          restaurant_id?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          purchase_order_id?: string
          quantity?: number
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
          id: string
          location_id: string
          order_date: string
          received_at: string | null
          restaurant_id: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          order_date?: string
          received_at?: string | null
          restaurant_id?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          order_date?: string
          received_at?: string | null
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
          created_at: string
          created_by: string | null
          customer_id: string | null
          decline_reason: string | null
          end_at: string
          id: string
          location_id: string
          party_size: number
          restaurant_id: string
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
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decline_reason?: string | null
          end_at: string
          id?: string
          location_id: string
          party_size?: number
          restaurant_id: string
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
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          decline_reason?: string | null
          end_at?: string
          id?: string
          location_id?: string
          party_size?: number
          restaurant_id?: string
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
          quantity: number
          restaurant_id: string | null
          sale_date: string
          total_price: number
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          location_id: string
          quantity?: number
          restaurant_id?: string | null
          sale_date?: string
          total_price?: number
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          location_id?: string
          quantity?: number
          restaurant_id?: string | null
          sale_date?: string
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
          captiva_operator_code: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          email: string | null
          first_name: string
          hourly_rate: number
          id: string
          last_name: string
          location_id: string | null
          max_hours_per_week: number
          min_hours_per_week: number | null
          phone: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
        }
        Insert: {
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          email?: string | null
          first_name: string
          hourly_rate?: number
          id?: string
          last_name: string
          location_id?: string | null
          max_hours_per_week?: number
          min_hours_per_week?: number | null
          phone?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
        }
        Update: {
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          email?: string | null
          first_name?: string
          hourly_rate?: number
          id?: string
          last_name?: string
          location_id?: string | null
          max_hours_per_week?: number
          min_hours_per_week?: number | null
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
          created_at: string
          id: string
          location_id: string
          restaurant_id: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          staff_id: string
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          created_at?: string
          id?: string
          location_id: string
          restaurant_id?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          staff_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          location_id?: string
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
          created_at: string
          id: string
          ingredient_id: string
          location_id: string
          quantity: number
          reason: string | null
          restaurant_id: string | null
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_type: string
          created_at?: string
          id?: string
          ingredient_id: string
          location_id: string
          quantity: number
          reason?: string | null
          restaurant_id?: string | null
        }
        Update: {
          adjusted_by?: string | null
          adjustment_type?: string
          created_at?: string
          id?: string
          ingredient_id?: string
          location_id?: string
          quantity?: number
          reason?: string | null
          restaurant_id?: string | null
        }
        Relationships: [
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
      user_restaurants: {
        Row: {
          created_at: string
          id: string
          is_default: boolean | null
          restaurant_id: string
          role: string
          role_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          restaurant_id: string
          role?: string
          role_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          api_key: string | null
          api_secret: string | null
          created_at: string | null
          id: string | null
          last_sync_time: string | null
          location_id: string | null
          pos_provider: string | null
          restaurant_id: string | null
          settings: Json | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: never
          api_secret?: never
          created_at?: string | null
          id?: string | null
          last_sync_time?: string | null
          location_id?: string | null
          pos_provider?: string | null
          restaurant_id?: string | null
          settings?: Json | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: never
          api_secret?: never
          created_at?: string | null
          id?: string | null
          last_sync_time?: string | null
          location_id?: string | null
          pos_provider?: string | null
          restaurant_id?: string | null
          settings?: Json | null
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
          captiva_operator_code: string | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          created_at: string | null
          email: string | null
          first_name: string | null
          hourly_rate: number | null
          id: string | null
          last_name: string | null
          location_id: string | null
          max_hours_per_week: number | null
          min_hours_per_week: number | null
          phone: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["staff_role"] | null
          status: Database["public"]["Enums"]["staff_status"] | null
          updated_at: string | null
        }
        Insert: {
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          email?: never
          first_name?: string | null
          hourly_rate?: never
          id?: string | null
          last_name?: string | null
          location_id?: string | null
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
          phone?: never
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"] | null
          status?: Database["public"]["Enums"]["staff_status"] | null
          updated_at?: string | null
        }
        Update: {
          captiva_operator_code?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          email?: never
          first_name?: string | null
          hourly_rate?: never
          id?: string | null
          last_name?: string | null
          location_id?: string | null
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
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
      calculate_dish_cost: { Args: { p_dish_id: string }; Returns: number }
      calculate_dish_margin: { Args: { p_dish_id: string }; Returns: number }
      calculate_staff_score: {
        Args: { p_date: string; p_staff_id: string }
        Returns: number
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
      ensure_user_restaurant: { Args: never; Returns: Json }
      get_ingredient_base_cost: {
        Args: { p_ingredient_id: string }
        Returns: number
      }
      get_latest_ingredient_price: {
        Args: { p_ingredient_id: string }
        Returns: number
      }
      get_user_permissions: { Args: never; Returns: Json }
      get_user_restaurant_id: { Args: never; Returns: string }
      get_user_role_id: { Args: never; Returns: string }
      log_audit_event: {
        Args: {
          p_data?: Json
          p_description: string
          p_event_type: string
          p_restaurant_id: string
        }
        Returns: string
      }
      tenant_filter: { Args: { _restaurant_id: string }; Returns: boolean }
      user_belongs_to_restaurant: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
      user_can_view_pos_credentials: { Args: never; Returns: boolean }
      user_has_permission: {
        Args: { p_action: string; p_resource: string }
        Returns: boolean
      }
      user_has_pos_admin: { Args: never; Returns: boolean }
      user_is_manager_or_owner: { Args: never; Returns: boolean }
    }
    Enums: {
      attendance_source: "manual" | "pos" | "auto"
      contract_type: "full_time" | "part_time" | "casual"
      reservation_source: "phone" | "walk_in" | "online" | "staff"
      reservation_status:
        | "inquiry"
        | "pending"
        | "confirmed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      reservation_source: ["phone", "walk_in", "online", "staff"],
      reservation_status: [
        "inquiry",
        "pending",
        "confirmed",
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
