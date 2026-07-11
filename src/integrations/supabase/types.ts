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
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          consent_data_retention: boolean | null
          country: string | null
          created_at: string
          email: string | null
          first_seen_at: string | null
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
          consent_data_retention?: boolean | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_seen_at?: string | null
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
          consent_data_retention?: boolean | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_seen_at?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      commission_rules: {
        Row: {
          active: boolean
          created_at: string
          flat_amount: number
          id: string
          percentage: number
          scope_employee_id: string | null
          scope_role: string | null
          trigger: Database["public"]["Enums"]["commission_trigger"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          flat_amount?: number
          id?: string
          percentage?: number
          scope_employee_id?: string | null
          scope_role?: string | null
          trigger: Database["public"]["Enums"]["commission_trigger"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          flat_amount?: number
          id?: string
          percentage?: number
          scope_employee_id?: string | null
          scope_role?: string | null
          trigger?: Database["public"]["Enums"]["commission_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_scope_employee_id_fkey"
            columns: ["scope_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          base_amount: number | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          package_id: string | null
          payment_id: string | null
          percentage: number | null
          status: Database["public"]["Enums"]["commission_status"]
          trigger: Database["public"]["Enums"]["commission_trigger"]
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          base_amount?: number | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          package_id?: string | null
          payment_id?: string | null
          percentage?: number | null
          status?: Database["public"]["Enums"]["commission_status"]
          trigger: Database["public"]["Enums"]["commission_trigger"]
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          base_amount?: number | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          package_id?: string | null
          payment_id?: string | null
          percentage?: number | null
          status?: Database["public"]["Enums"]["commission_status"]
          trigger?: Database["public"]["Enums"]["commission_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_assignment_events: {
        Row: {
          actor_display_name: string | null
          actor_id: string | null
          conversation_id: string
          created_at: string
          event_type: string
          from_staff_id: string | null
          id: string
          metadata: Json | null
          to_staff_id: string | null
        }
        Insert: {
          actor_display_name?: string | null
          actor_id?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          from_staff_id?: string | null
          id?: string
          metadata?: Json | null
          to_staff_id?: string | null
        }
        Update: {
          actor_display_name?: string | null
          actor_id?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          from_staff_id?: string | null
          id?: string
          metadata?: Json | null
          to_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignment_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_enabled: boolean
          assigned_at: string | null
          assigned_staff_id: string | null
          channel: string
          client_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          whatsapp_number: string
        }
        Insert: {
          ai_enabled?: boolean
          assigned_at?: string | null
          assigned_staff_id?: string | null
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          whatsapp_number: string
        }
        Update: {
          ai_enabled?: boolean
          assigned_at?: string | null
          assigned_staff_id?: string | null
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
      customers: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          default_address: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          national_id: string | null
          notes: string | null
          phone: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          default_address?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          national_id?: string | null
          notes?: string | null
          phone: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          default_address?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          national_id?: string | null
          notes?: string | null
          phone?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          collected_at: string
          collected_by_id_number: string | null
          collected_by_name: string
          collected_by_phone: string | null
          created_at: string
          id: string
          package_id: string
          proof_photo_url: string | null
          relationship_to_customer: string | null
          released_by_employee_id: string | null
          signature_url: string | null
        }
        Insert: {
          collected_at?: string
          collected_by_id_number?: string | null
          collected_by_name: string
          collected_by_phone?: string | null
          created_at?: string
          id?: string
          package_id: string
          proof_photo_url?: string | null
          relationship_to_customer?: string | null
          released_by_employee_id?: string | null
          signature_url?: string | null
        }
        Update: {
          collected_at?: string
          collected_by_id_number?: string | null
          collected_by_name?: string
          collected_by_phone?: string | null
          created_at?: string
          id?: string
          package_id?: string
          proof_photo_url?: string | null
          relationship_to_customer?: string | null
          released_by_employee_id?: string | null
          signature_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: true
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_released_by_employee_id_fkey"
            columns: ["released_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      employees: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          email: string
          employee_code: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          email: string
          employee_code: string
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          email?: string
          employee_code?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          key: string
          response_body: Json | null
          response_status: number
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          key: string
          response_body?: Json | null
          response_status: number
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          key?: string
          response_body?: Json | null
          response_status?: number
          user_id?: string
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
          created_by: string | null
          evolution_message_id: string | null
          id: string
          media_url: string | null
          role: Database["public"]["Enums"]["message_role"]
          staff_display_name: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          created_by?: string | null
          evolution_message_id?: string | null
          id?: string
          media_url?: string | null
          role: Database["public"]["Enums"]["message_role"]
          staff_display_name?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          evolution_message_id?: string | null
          id?: string
          media_url?: string | null
          role?: Database["public"]["Enums"]["message_role"]
          staff_display_name?: string | null
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
        Relationships: []
      }
      package_images: {
        Row: {
          captured_at: string
          captured_by: string | null
          created_at: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          kind: Database["public"]["Enums"]["package_image_kind"]
          package_id: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["package_image_kind"]
          package_id: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["package_image_kind"]
          package_id?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_images_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_status_history: {
        Row: {
          changed_by_employee_id: string | null
          changed_by_user_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["pkg_status"] | null
          id: string
          notes: string | null
          package_id: string
          to_status: Database["public"]["Enums"]["pkg_status"]
        }
        Insert: {
          changed_by_employee_id?: string | null
          changed_by_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["pkg_status"] | null
          id?: string
          notes?: string | null
          package_id: string
          to_status: Database["public"]["Enums"]["pkg_status"]
        }
        Update: {
          changed_by_employee_id?: string | null
          changed_by_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["pkg_status"] | null
          id?: string
          notes?: string | null
          package_id?: string
          to_status?: Database["public"]["Enums"]["pkg_status"]
        }
        Relationships: [
          {
            foreignKeyName: "package_status_history_changed_by_employee_id_fkey"
            columns: ["changed_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_status_history_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          amount_due: number
          amount_paid: number
          barcode: string | null
          bin_code: string | null
          cargo_type: Database["public"]["Enums"]["cargo_type"] | null
          category: string | null
          chargeable_weight_kg: number | null
          cleared_at: string | null
          collected_at: string | null
          courier: string | null
          created_at: string
          currency: string
          customer_id: string | null
          declared_currency: string | null
          declared_value: number | null
          description: string | null
          destination_city: string | null
          external_barcode: string | null
          height_cm: number | null
          id: string
          intake_photo_url: string | null
          length_cm: number | null
          nature_of_goods: string | null
          ocr_confidence: number | null
          ocr_payload: Json | null
          origin: string | null
          payment_type: string | null
          pieces: number | null
          qr_code_token: string
          rack: string | null
          ready_at: string | null
          received_at: string
          received_by_employee_id: string | null
          remark: string | null
          route_code: string | null
          sales_manager_employee_id: string | null
          sales_rep_employee_id: string | null
          second_tracking_number: string | null
          shelf_id: string | null
          shipping_cost: number | null
          shipping_method: string | null
          special_notes: string | null
          status: Database["public"]["Enums"]["pkg_status"]
          supplier: string | null
          tracking_number: string
          updated_at: string
          verified_at: string | null
          volume_m3: number | null
          warehouse_id: string | null
          weight_kg: number | null
          width_cm: number | null
          zone: string | null
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          barcode?: string | null
          bin_code?: string | null
          cargo_type?: Database["public"]["Enums"]["cargo_type"] | null
          category?: string | null
          chargeable_weight_kg?: number | null
          cleared_at?: string | null
          collected_at?: string | null
          courier?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          declared_currency?: string | null
          declared_value?: number | null
          description?: string | null
          destination_city?: string | null
          external_barcode?: string | null
          height_cm?: number | null
          id?: string
          intake_photo_url?: string | null
          length_cm?: number | null
          nature_of_goods?: string | null
          ocr_confidence?: number | null
          ocr_payload?: Json | null
          origin?: string | null
          payment_type?: string | null
          pieces?: number | null
          qr_code_token?: string
          rack?: string | null
          ready_at?: string | null
          received_at?: string
          received_by_employee_id?: string | null
          remark?: string | null
          route_code?: string | null
          sales_manager_employee_id?: string | null
          sales_rep_employee_id?: string | null
          second_tracking_number?: string | null
          shelf_id?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          special_notes?: string | null
          status?: Database["public"]["Enums"]["pkg_status"]
          supplier?: string | null
          tracking_number: string
          updated_at?: string
          verified_at?: string | null
          volume_m3?: number | null
          warehouse_id?: string | null
          weight_kg?: number | null
          width_cm?: number | null
          zone?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          barcode?: string | null
          bin_code?: string | null
          cargo_type?: Database["public"]["Enums"]["cargo_type"] | null
          category?: string | null
          chargeable_weight_kg?: number | null
          cleared_at?: string | null
          collected_at?: string | null
          courier?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          declared_currency?: string | null
          declared_value?: number | null
          description?: string | null
          destination_city?: string | null
          external_barcode?: string | null
          height_cm?: number | null
          id?: string
          intake_photo_url?: string | null
          length_cm?: number | null
          nature_of_goods?: string | null
          ocr_confidence?: number | null
          ocr_payload?: Json | null
          origin?: string | null
          payment_type?: string | null
          pieces?: number | null
          qr_code_token?: string
          rack?: string | null
          ready_at?: string | null
          received_at?: string
          received_by_employee_id?: string | null
          remark?: string | null
          route_code?: string | null
          sales_manager_employee_id?: string | null
          sales_rep_employee_id?: string | null
          second_tracking_number?: string | null
          shelf_id?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          special_notes?: string | null
          status?: Database["public"]["Enums"]["pkg_status"]
          supplier?: string | null
          tracking_number?: string
          updated_at?: string
          verified_at?: string | null
          volume_m3?: number | null
          warehouse_id?: string | null
          weight_kg?: number | null
          width_cm?: number | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_received_by_employee_id_fkey"
            columns: ["received_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_sales_manager_employee_id_fkey"
            columns: ["sales_manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_sales_rep_employee_id_fkey"
            columns: ["sales_rep_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_shelf_fk"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "warehouse_shelves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
          customer_id: string | null
          id: string
          initiated_by: string | null
          merchant_request_id: string | null
          method: string | null
          mpesa_code: string | null
          mpesa_receipt: string | null
          package_id: string | null
          phone: string
          purpose: string | null
          raw_callback: Json | null
          receipt_url: string | null
          recorded_by_employee_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          initiated_by?: string | null
          merchant_request_id?: string | null
          method?: string | null
          mpesa_code?: string | null
          mpesa_receipt?: string | null
          package_id?: string | null
          phone: string
          purpose?: string | null
          raw_callback?: Json | null
          receipt_url?: string | null
          recorded_by_employee_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          initiated_by?: string | null
          merchant_request_id?: string | null
          method?: string | null
          mpesa_code?: string | null
          mpesa_receipt?: string | null
          package_id?: string | null
          phone?: string
          purpose?: string | null
          raw_callback?: Json | null
          receipt_url?: string | null
          recorded_by_employee_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_at?: string | null
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
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_employee_id_fkey"
            columns: ["recorded_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      push_tokens: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          hit_at: string
          id: number
        }
        Insert: {
          bucket: string
          hit_at?: string
          id?: number
        }
        Update: {
          bucket?: string
          hit_at?: string
          id?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
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
      warehouse_bins: {
        Row: {
          code: string
          created_at: string
          id: string
          is_occupied: boolean
          shelf_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_occupied?: boolean
          shelf_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_occupied?: boolean
          shelf_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_bins_shelf_id_fkey"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "warehouse_shelves"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_shelves: {
        Row: {
          capacity: number | null
          code: string
          created_at: string
          id: string
          section: string | null
          warehouse_id: string
        }
        Insert: {
          capacity?: number | null
          code: string
          created_at?: string
          id?: string
          section?: string | null
          warehouse_id: string
        }
        Update: {
          capacity?: number | null
          code?: string
          created_at?: string
          id?: string
          section?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_shelves_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          code: string
          contact_name: string | null
          contact_phone: string | null
          country_code: string
          created_at: string
          id: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          code: string
          contact_name?: string | null
          contact_phone?: string | null
          country_code: string
          created_at?: string
          id?: string
          name: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          code?: string
          contact_name?: string | null
          contact_phone?: string | null
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_logs: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          error: string | null
          id: string
          package_id: string | null
          payload: Json | null
          provider_message_id: string | null
          status: string
          template: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          package_id?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          status?: string
          template: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          package_id?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          status?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_logs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_register_employee: {
        Args: {
          _branch_id?: string
          _email: string
          _full_name: string
          _notes?: string
          _phone: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          email: string
          employee_code: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_expired_delivery_records: { Args: never; Returns: number }
      atomic_claim_conversation: {
        Args: {
          _conversation_id: string
          _expected_current?: string
          _staff_id: string
        }
        Returns: string
      }
      award_commission: {
        Args: {
          _base?: number
          _employee_id: string
          _package_id: string
          _payment_id?: string
          _trigger: Database["public"]["Enums"]["commission_trigger"]
        }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          base_amount: number | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          package_id: string | null
          payment_id: string | null
          percentage: number | null
          status: Database["public"]["Enums"]["commission_status"]
          trigger: Database["public"]["Enums"]["commission_trigger"]
        }
        SetofOptions: {
          from: "*"
          to: "commissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_rate_limit: {
        Args: { _bucket: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
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
      is_valid_pkg_transition: {
        Args: {
          _from: Database["public"]["Enums"]["pkg_status"]
          _to: Database["public"]["Enums"]["pkg_status"]
        }
        Returns: boolean
      }
      issue_api_key: {
        Args: { _label: string; _user_id: string }
        Returns: {
          id: string
          key_prefix: string
          raw_key: string
        }[]
      }
      prune_rate_limit_hits: { Args: never; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      transition_package_status: {
        Args: {
          _employee_id: string
          _notes?: string
          _package_id: string
          _to: Database["public"]["Enums"]["pkg_status"]
        }
        Returns: {
          amount_due: number
          amount_paid: number
          barcode: string | null
          bin_code: string | null
          cargo_type: Database["public"]["Enums"]["cargo_type"] | null
          category: string | null
          chargeable_weight_kg: number | null
          cleared_at: string | null
          collected_at: string | null
          courier: string | null
          created_at: string
          currency: string
          customer_id: string | null
          declared_currency: string | null
          declared_value: number | null
          description: string | null
          destination_city: string | null
          external_barcode: string | null
          height_cm: number | null
          id: string
          intake_photo_url: string | null
          length_cm: number | null
          nature_of_goods: string | null
          ocr_confidence: number | null
          ocr_payload: Json | null
          origin: string | null
          payment_type: string | null
          pieces: number | null
          qr_code_token: string
          rack: string | null
          ready_at: string | null
          received_at: string
          received_by_employee_id: string | null
          remark: string | null
          route_code: string | null
          sales_manager_employee_id: string | null
          sales_rep_employee_id: string | null
          second_tracking_number: string | null
          shelf_id: string | null
          shipping_cost: number | null
          shipping_method: string | null
          special_notes: string | null
          status: Database["public"]["Enums"]["pkg_status"]
          supplier: string | null
          tracking_number: string
          updated_at: string
          verified_at: string | null
          volume_m3: number | null
          warehouse_id: string | null
          weight_kg: number | null
          width_cm: number | null
          zone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "packages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_api_key: { Args: { _raw_key: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "staff"
        | "client"
        | "china_staff"
        | "kenya_staff"
        | "logistics_manager"
        | "sales_manager"
        | "sales_rep"
      cargo_type: "general" | "special"
      commission_status: "pending" | "approved" | "paid" | "void"
      commission_trigger: "received" | "payment" | "delivery"
      message_role: "user" | "assistant" | "system" | "staff"
      package_image_kind:
        | "sticker"
        | "extra"
        | "proof_of_collection"
        | "qr"
        | "package"
        | "damage"
        | "pickup"
        | "delivery"
        | "signature"
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
        | "awaiting_payment"
        | "paid"
        | "ready_for_collection"
        | "released"
        | "cleared"
      pay_method: "mpesa_stk" | "mpesa_manual" | "cash" | "bank"
      pay_status: "pending" | "paid" | "failed" | "refunded" | "cancelled"
      payment_status: "pending" | "success" | "failed" | "cancelled"
      pkg_status:
        | "received"
        | "verified"
        | "awaiting_payment"
        | "paid"
        | "ready_for_collection"
        | "collected"
        | "cleared"
        | "cancelled"
        | "registered"
        | "arrived"
        | "awaiting_pickup"
        | "reserved"
        | "picked_up"
        | "returned"
        | "lost"
      post_status: "draft" | "approved" | "scheduled" | "published" | "failed"
      shipping_mode: "air" | "sea" | "express" | "special"
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
      app_role: [
        "admin",
        "staff",
        "client",
        "china_staff",
        "kenya_staff",
        "logistics_manager",
        "sales_manager",
        "sales_rep",
      ],
      cargo_type: ["general", "special"],
      commission_status: ["pending", "approved", "paid", "void"],
      commission_trigger: ["received", "payment", "delivery"],
      message_role: ["user", "assistant", "system", "staff"],
      package_image_kind: [
        "sticker",
        "extra",
        "proof_of_collection",
        "qr",
        "package",
        "damage",
        "pickup",
        "delivery",
        "signature",
      ],
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
        "awaiting_payment",
        "paid",
        "ready_for_collection",
        "released",
        "cleared",
      ],
      pay_method: ["mpesa_stk", "mpesa_manual", "cash", "bank"],
      pay_status: ["pending", "paid", "failed", "refunded", "cancelled"],
      payment_status: ["pending", "success", "failed", "cancelled"],
      pkg_status: [
        "received",
        "verified",
        "awaiting_payment",
        "paid",
        "ready_for_collection",
        "collected",
        "cleared",
        "cancelled",
        "registered",
        "arrived",
        "awaiting_pickup",
        "reserved",
        "picked_up",
        "returned",
        "lost",
      ],
      post_status: ["draft", "approved", "scheduled", "published", "failed"],
      shipping_mode: ["air", "sea", "express", "special"],
      social_platform: ["facebook", "instagram", "tiktok", "x"],
    },
  },
} as const
