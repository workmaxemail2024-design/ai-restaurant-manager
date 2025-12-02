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
      dish_ingredients: {
        Row: {
          created_at: string
          dish_id: string
          id: string
          ingredient_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          ingredient_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          ingredient_id?: string
          quantity?: number
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
        ]
      }
      dishes: {
        Row: {
          category: string | null
          created_at: string
          id: string
          location_id: string | null
          name: string
          selling_price: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          selling_price?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
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
        ]
      }
      ingredient_prices: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          ingredient_id: string
        }
        Insert: {
          cost_price: number
          created_at?: string
          id?: string
          ingredient_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_prices_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          created_at: string
          default_cost_price: number
          id: string
          name: string
          storage_type: Database["public"]["Enums"]["storage_type"]
          supplier_id: string | null
          unit: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_cost_price?: number
          id?: string
          name: string
          storage_type?: Database["public"]["Enums"]["storage_type"]
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_cost_price?: number
          id?: string
          name?: string
          storage_type?: Database["public"]["Enums"]["storage_type"]
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: [
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
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
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
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id: string
          purchase_order_id: string
          quantity?: number
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          purchase_order_id?: string
          quantity?: number
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
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          id: string
          location_id: string
          order_date: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          order_date?: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          order_date?: string
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
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          sale_date: string
          total_price: number
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          location_id: string
          quantity?: number
          sale_date?: string
          total_price?: number
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          location_id?: string
          quantity?: number
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
        ]
      }
      staff: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          hourly_rate: number
          id: string
          last_name: string
          location_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          hourly_rate?: number
          id?: string
          last_name: string
          location_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          hourly_rate?: number
          id?: string
          last_name?: string
          location_id?: string | null
          phone?: string | null
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
        ]
      }
      staff_attendance: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          location_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          staff_id: string
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          created_at?: string
          id?: string
          location_id: string
          source?: Database["public"]["Enums"]["attendance_source"]
          staff_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          location_id?: string
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
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
          score?: number | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_performance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string
          id: string
          location_id: string
          notes: string | null
          shift_end: string
          shift_start: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          shift_end: string
          shift_start: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
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
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
          updated_at: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          location_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          location_id?: string
          quantity?: number
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
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_dish_cost: { Args: { p_dish_id: string }; Returns: number }
      calculate_dish_margin: { Args: { p_dish_id: string }; Returns: number }
      calculate_staff_score: {
        Args: { p_date: string; p_staff_id: string }
        Returns: number
      }
      get_latest_ingredient_price: {
        Args: { p_ingredient_id: string }
        Returns: number
      }
    }
    Enums: {
      attendance_source: "manual" | "pos" | "auto"
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
      unit_type: ["kg", "g", "L", "ml", "oz", "each"],
    },
  },
} as const
