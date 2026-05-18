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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      batch_packages: {
        Row: {
          batch_id: string
          id: string
          loaded_at: string
          loaded_by: string | null
          notes: string | null
          package_id: string
        }
        Insert: {
          batch_id: string
          id?: string
          loaded_at?: string
          loaded_by?: string | null
          notes?: string | null
          package_id: string
        }
        Update: {
          batch_id?: string
          id?: string
          loaded_at?: string
          loaded_by?: string | null
          notes?: string | null
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_packages_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "loading_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string | null
          whatsapp_number: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_enabled: boolean
          channel: string
          client_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          whatsapp_number: string
        }
        Insert: {
          ai_enabled?: boolean
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          whatsapp_number: string
        }
        Update: {
          ai_enabled?: boolean
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_signatures: {
        Row: {
          amount_paid: number | null
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          package_id: string
          payment_id: string | null
          payment_method: string
          recorded_by: string | null
          signature_url: string
          signer_name: string
          signer_phone: string | null
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          package_id: string
          payment_id?: string | null
          payment_method?: string
          recorded_by?: string | null
          signature_url: string
          signer_name: string
          signer_phone?: string | null
        }
        Update: {
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          package_id?: string
          payment_id?: string | null
          payment_method?: string
          recorded_by?: string | null
          signature_url?: string
          signer_name?: string
          signer_phone?: string | null
        }
        Relationships: []
      }
      employee_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      loading_batches: {
        Row: {
          batch_code: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          cutoff_at: string
          destination_warehouse: string
          expected_total: number
          id: string
          left_behind_total: number
          loaded_total: number
          loading_date: string
          notes: string | null
          origin_warehouse: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_code: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_at?: string
          destination_warehouse?: string
          expected_total?: number
          id?: string
          left_behind_total?: number
          loaded_total?: number
          loading_date: string
          notes?: string | null
          origin_warehouse?: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_code?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_at?: string
          destination_warehouse?: string
          expected_total?: number
          id?: string
          left_behind_total?: number
          loaded_total?: number
          loading_date?: string
          notes?: string | null
          origin_warehouse?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_posts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          external_post_id: string | null
          hashtags: string | null
          id: string
          image_url: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          published_at: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["post_status"]
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          external_post_id?: string | null
          hashtags?: string | null
          id?: string
          image_url?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          published_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          external_post_id?: string | null
          hashtags?: string | null
          id?: string
          image_url?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          published_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          evolution_message_id: string | null
          id: string
          media_url: string | null
          role: Database["public"]["Enums"]["message_role"]
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          evolution_message_id?: string | null
          id?: string
          media_url?: string | null
          role: Database["public"]["Enums"]["message_role"]
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          evolution_message_id?: string | null
          id?: string
          media_url?: string | null
          role?: Database["public"]["Enums"]["message_role"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string
          batch_id: string | null
          body: string | null
          created_at: string
          data: Json | null
          id: string
          package_id: string | null
          severity: string
          title: string
          type: string
        }
        Insert: {
          audience?: string
          batch_id?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          package_id?: string | null
          severity?: string
          title: string
          type: string
        }
        Update: {
          audience?: string
          batch_id?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          package_id?: string | null
          severity?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "loading_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          notes: string | null
          notified_client: boolean
          package_id: string
          photo_url: string | null
          status: Database["public"]["Enums"]["package_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          notified_client?: boolean
          package_id: string
          photo_url?: string | null
          status: Database["public"]["Enums"]["package_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          notified_client?: boolean
          package_id?: string
          photo_url?: string | null
          status?: Database["public"]["Enums"]["package_status"]
        }
        Relationships: [
          {
            foreignKeyName: "package_events_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          category: string | null
          cbm: number | null
          client_id: string | null
          created_at: string
          currency: string | null
          declared_value: number | null
          delivered_at: string | null
          description: string | null
          destination_city: string | null
          destination_country: string | null
          estimated_arrival: string | null
          height_cm: number | null
          id: string
          length_cm: number | null
          mode: Database["public"]["Enums"]["shipping_mode"] | null
          origin: string | null
          received_at: string | null
          sender_name: string | null
          sender_phone: string | null
          shipping_cost: number | null
          status: Database["public"]["Enums"]["package_status"]
          tracking_number: string
          updated_at: string
          warehouse_photo_url: string | null
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          category?: string | null
          cbm?: number | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          declared_value?: number | null
          delivered_at?: string | null
          description?: string | null
          destination_city?: string | null
          destination_country?: string | null
          estimated_arrival?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          mode?: Database["public"]["Enums"]["shipping_mode"] | null
          origin?: string | null
          received_at?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["package_status"]
          tracking_number: string
          updated_at?: string
          warehouse_photo_url?: string | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          category?: string | null
          cbm?: number | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          declared_value?: number | null
          delivered_at?: string | null
          description?: string | null
          destination_city?: string | null
          destination_country?: string | null
          estimated_arrival?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          mode?: Database["public"]["Enums"]["shipping_mode"] | null
          origin?: string | null
          received_at?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["package_status"]
          tracking_number?: string
          updated_at?: string
          warehouse_photo_url?: string | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          checkout_request_id: string | null
          client_id: string | null
          created_at: string
          currency: string
          id: string
          merchant_request_id: string | null
          mpesa_receipt: string | null
          package_id: string | null
          phone: string
          raw_callback: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          package_id?: string | null
          phone: string
          raw_callback?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          package_id?: string | null
          phone?: string
          raw_callback?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean | null
          language_preference: string | null
          phone: string | null
          staff_location: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          is_active?: boolean | null
          language_preference?: string | null
          phone?: string | null
          staff_location?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          language_preference?: string | null
          phone?: string | null
          staff_location?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rates: {
        Row: {
          active: boolean
          category: string
          created_at: string
          currency: string
          destination_country: string
          id: string
          min_charge: number | null
          mode: Database["public"]["Enums"]["shipping_mode"]
          notes: string | null
          origin_country: string | null
          price_per_cbm: number | null
          price_per_kg: number | null
          transit_days_max: number | null
          transit_days_min: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          currency?: string
          destination_country: string
          id?: string
          min_charge?: number | null
          mode: Database["public"]["Enums"]["shipping_mode"]
          notes?: string | null
          origin_country?: string | null
          price_per_cbm?: number | null
          price_per_kg?: number | null
          transit_days_max?: number | null
          transit_days_min?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          currency?: string
          destination_country?: string
          id?: string
          min_charge?: number | null
          mode?: Database["public"]["Enums"]["shipping_mode"]
          notes?: string | null
          origin_country?: string | null
          price_per_cbm?: number | null
          price_per_kg?: number | null
          transit_days_max?: number | null
          transit_days_min?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      social_publish_results: {
        Row: {
          attempted_at: string
          error: string | null
          external_id: string | null
          id: string
          permalink: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          post_id: string
          raw_response: Json | null
          status: string
        }
        Insert: {
          attempted_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          permalink?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          post_id: string
          raw_response?: Json | null
          status?: string
        }
        Update: {
          attempted_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          permalink?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          post_id?: string
          raw_response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_publish_results_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "marketing_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      detect_left_behind: {
        Args: { _batch_id: string }
        Returns: {
          days_in_warehouse: number
          package_id: string
          tracking_number: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      issue_api_key: {
        Args: { _label: string; _user_id: string }
        Returns: {
          id: string
          key_prefix: string
          raw_key: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      verify_api_key: { Args: { _raw_key: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "staff" | "client" | "china_staff" | "kenya_staff"
      message_role: "user" | "assistant" | "system" | "staff"
      package_status:
        | "pending"
        | "received_in_china"
        | "processing"
        | "in_transit"
        | "arrived_destination"
        | "out_for_delivery"
        | "delivered"
        | "on_hold"
        | "cancelled"
      payment_status: "pending" | "success" | "failed" | "cancelled"
      post_status: "draft" | "approved" | "scheduled" | "published" | "failed"
      shipping_mode: "air" | "sea" | "express"
      social_platform: "facebook" | "instagram" | "tiktok" | "x"
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
      app_role: ["admin", "staff", "client", "china_staff", "kenya_staff"],
      message_role: ["user", "assistant", "system", "staff"],
      package_status: [
        "pending",
        "received_in_china",
        "processing",
        "in_transit",
        "arrived_destination",
        "out_for_delivery",
        "delivered",
        "on_hold",
        "cancelled",
      ],
      payment_status: ["pending", "success", "failed", "cancelled"],
      post_status: ["draft", "approved", "scheduled", "published", "failed"],
      shipping_mode: ["air", "sea", "express"],
      social_platform: ["facebook", "instagram", "tiktok", "x"],
    },
  },
} as const
