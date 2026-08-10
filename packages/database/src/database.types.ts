export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_type: string
          cancellation_reason: string | null
          client_id: string | null
          completed_at: string | null
          confirmed_at: string | null
          contact_name: string | null
          contact_phone_display: string | null
          contact_phone_e164: string | null
          created_at: string
          created_by_device_id: string | null
          decline_reason: string | null
          deleted_at: string | null
          id: string
          last_modified_by_device_id: string | null
          patient_id: string | null
          reason_for_visit: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          server_version: number
          status: string
          status_changed_at: string
          travel_notes: string | null
          updated_at: string
          vet_id: string
          visit_address: string | null
          visit_id: string | null
          visit_latitude: number | null
          visit_longitude: number | null
        }
        Insert: {
          appointment_type: string
          cancellation_reason?: string | null
          client_id?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contact_name?: string | null
          contact_phone_display?: string | null
          contact_phone_e164?: string | null
          created_at?: string
          created_by_device_id?: string | null
          decline_reason?: string | null
          deleted_at?: string | null
          id: string
          last_modified_by_device_id?: string | null
          patient_id?: string | null
          reason_for_visit?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          server_version?: number
          status?: string
          status_changed_at?: string
          travel_notes?: string | null
          updated_at?: string
          vet_id: string
          visit_address?: string | null
          visit_id?: string | null
          visit_latitude?: number | null
          visit_longitude?: number | null
        }
        Update: {
          appointment_type?: string
          cancellation_reason?: string | null
          client_id?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contact_name?: string | null
          contact_phone_display?: string | null
          contact_phone_e164?: string | null
          created_at?: string
          created_by_device_id?: string | null
          decline_reason?: string | null
          deleted_at?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          patient_id?: string | null
          reason_for_visit?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          server_version?: number
          status?: string
          status_changed_at?: string
          travel_notes?: string | null
          updated_at?: string
          vet_id?: string
          visit_address?: string | null
          visit_id?: string | null
          visit_latitude?: number | null
          visit_longitude?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          attachment_type: string
          captured_at: string | null
          checksum_sha256: string | null
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          failure_reason: string | null
          id: string
          last_modified_by_device_id: string | null
          mime_type: string
          original_filename: string
          patient_id: string | null
          server_version: number
          size_bytes: number
          storage_bucket: string
          storage_path: string
          updated_at: string
          upload_status: string
          uploaded_at: string | null
          vet_id: string
          visit_id: string | null
        }
        Insert: {
          attachment_type: string
          captured_at?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          failure_reason?: string | null
          id: string
          last_modified_by_device_id?: string | null
          mime_type: string
          original_filename: string
          patient_id?: string | null
          server_version?: number
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          upload_status?: string
          uploaded_at?: string | null
          vet_id: string
          visit_id?: string | null
        }
        Update: {
          attachment_type?: string
          captured_at?: string | null
          checksum_sha256?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          failure_reason?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          mime_type?: string
          original_filename?: string
          patient_id?: string | null
          server_version?: number
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          upload_status?: string
          uploaded_at?: string | null
          vet_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_auth_user_id: string | null
          actor_vet_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          occurred_at: string
          reason: string | null
          vet_id: string | null
        }
        Insert: {
          action: string
          actor_auth_user_id?: string | null
          actor_vet_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          vet_id?: string | null
        }
        Update: {
          action?: string
          actor_auth_user_id?: string | null
          actor_vet_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          vet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_vet_id_fkey"
            columns: ["actor_vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          client_code: string
          communication_consent: boolean
          consent_recorded_at: string | null
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          email: string | null
          id: string
          last_modified_by_device_id: string | null
          location_latitude: number | null
          location_longitude: number | null
          name: string
          notes: string | null
          phone_display: string
          phone_e164: string
          server_version: number
          updated_at: string
          vet_id: string
          whatsapp_display: string | null
          whatsapp_e164: string | null
        }
        Insert: {
          address?: string | null
          client_code: string
          communication_consent?: boolean
          consent_recorded_at?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          email?: string | null
          id: string
          last_modified_by_device_id?: string | null
          location_latitude?: number | null
          location_longitude?: number | null
          name: string
          notes?: string | null
          phone_display: string
          phone_e164: string
          server_version?: number
          updated_at?: string
          vet_id: string
          whatsapp_display?: string | null
          whatsapp_e164?: string | null
        }
        Update: {
          address?: string | null
          client_code?: string
          communication_consent?: boolean
          consent_recorded_at?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          location_latitude?: number | null
          location_longitude?: number | null
          name?: string
          notes?: string | null
          phone_display?: string
          phone_e164?: string
          server_version?: number
          updated_at?: string
          vet_id?: string
          whatsapp_display?: string | null
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_route_stops: {
        Row: {
          appointment_id: string
          arrival_notes: string | null
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          estimated_arrival: string | null
          id: string
          last_modified_by_device_id: string | null
          route_id: string
          sequence_number: number
          server_version: number
          updated_at: string
          vet_id: string
        }
        Insert: {
          appointment_id: string
          arrival_notes?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          estimated_arrival?: string | null
          id: string
          last_modified_by_device_id?: string | null
          route_id: string
          sequence_number: number
          server_version?: number
          updated_at?: string
          vet_id: string
        }
        Update: {
          appointment_id?: string
          arrival_notes?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          estimated_arrival?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          route_id?: string
          sequence_number?: number
          server_version?: number
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_route_stops_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_route_stops_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_route_stops_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "daily_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_route_stops_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_routes: {
        Row: {
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          id: string
          last_modified_by_device_id: string | null
          notes: string | null
          optimization_method: string | null
          optimized: boolean
          route_date: string
          server_version: number
          updated_at: string
          vet_id: string
        }
        Insert: {
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id: string
          last_modified_by_device_id?: string | null
          notes?: string | null
          optimization_method?: string | null
          optimized?: boolean
          route_date: string
          server_version?: number
          updated_at?: string
          vet_id: string
        }
        Update: {
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          notes?: string | null
          optimization_method?: string | null
          optimized?: boolean
          route_date?: string
          server_version?: number
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_routes_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_routes_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_routes_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_lot_number: string | null
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          expiry_date: string | null
          id: string
          item_id: string
          last_modified_by_device_id: string | null
          quantity_on_hand: number
          received_at: string
          server_version: number
          unit_cost_pesewas: number | null
          updated_at: string
          vet_id: string
        }
        Insert: {
          batch_lot_number?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id: string
          item_id: string
          last_modified_by_device_id?: string | null
          quantity_on_hand?: number
          received_at?: string
          server_version?: number
          unit_cost_pesewas?: number | null
          updated_at?: string
          vet_id: string
        }
        Update: {
          batch_lot_number?: string | null
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          item_id?: string
          last_modified_by_device_id?: string | null
          quantity_on_hand?: number
          received_at?: string
          server_version?: number
          unit_cost_pesewas?: number | null
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          active: boolean
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          id: string
          item_name: string
          item_type: string
          last_modified_by_device_id: string | null
          reorder_threshold: number | null
          server_version: number
          unit: string
          updated_at: string
          vet_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id: string
          item_name: string
          item_type: string
          last_modified_by_device_id?: string | null
          reorder_threshold?: number | null
          server_version?: number
          unit: string
          updated_at?: string
          vet_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id?: string
          item_name?: string
          item_type?: string
          last_modified_by_device_id?: string | null
          reorder_threshold?: number | null
          server_version?: number
          unit?: string
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string
          created_at: string
          created_by_device_id: string | null
          id: string
          movement_type: string
          notes: string | null
          quantity: number
          server_version: number
          vet_id: string
          visit_id: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by_device_id?: string | null
          id: string
          movement_type: string
          notes?: string | null
          quantity: number
          server_version?: number
          vet_id: string
          visit_id?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by_device_id?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          quantity?: number
          server_version?: number
          vet_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          description: string
          id: string
          invoice_id: string
          last_modified_by_device_id: string | null
          line_total_pesewas: number
          quantity: number
          sequence_number: number
          server_version: number
          unit_price_pesewas: number
          updated_at: string
          vet_id: string
        }
        Insert: {
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          description: string
          id: string
          invoice_id: string
          last_modified_by_device_id?: string | null
          line_total_pesewas: number
          quantity?: number
          sequence_number: number
          server_version?: number
          unit_price_pesewas: number
          updated_at?: string
          vet_id: string
        }
        Update: {
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          last_modified_by_device_id?: string | null
          line_total_pesewas?: number
          quantity?: number
          sequence_number?: number
          server_version?: number
          unit_price_pesewas?: number
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "visit_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount_pesewas: number
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          id: string
          invoice_id: string
          last_modified_by_device_id: string | null
          method: string
          notes: string | null
          paid_at: string
          reference: string | null
          server_version: number
          updated_at: string
          vet_id: string
        }
        Insert: {
          amount_pesewas: number
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id: string
          invoice_id: string
          last_modified_by_device_id?: string | null
          method: string
          notes?: string | null
          paid_at: string
          reference?: string | null
          server_version?: number
          updated_at?: string
          vet_id: string
        }
        Update: {
          amount_pesewas?: number
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          last_modified_by_device_id?: string | null
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          server_version?: number
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "visit_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_owners: {
        Row: {
          client_id: string
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          id: string
          is_primary: boolean
          last_modified_by_device_id: string | null
          patient_id: string
          relationship: string
          server_version: number
          updated_at: string
          valid_from: string
          valid_to: string | null
          vet_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id: string
          is_primary?: boolean
          last_modified_by_device_id?: string | null
          patient_id: string
          relationship?: string
          server_version?: number
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          vet_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          last_modified_by_device_id?: string | null
          patient_id?: string
          relationship?: string
          server_version?: number
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_owners_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_owners_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_owners_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_owners_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_owners_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          breed: string | null
          color_markings: string | null
          created_at: string
          created_by_device_id: string | null
          date_of_birth: string | null
          date_of_birth_precision: string
          deceased_at: string | null
          deleted_at: string | null
          ear_tag: string | null
          group_age_weeks: number | null
          head_count: number | null
          housing: string | null
          id: string
          identification_notes: string | null
          kind: string
          last_modified_by_device_id: string | null
          leg_ring: string | null
          microchip_id: string | null
          name: string
          patient_code: string
          purpose: string
          server_version: number
          sex: string | null
          species: string
          status: string
          updated_at: string
          vet_id: string
        }
        Insert: {
          breed?: string | null
          color_markings?: string | null
          created_at?: string
          created_by_device_id?: string | null
          date_of_birth?: string | null
          date_of_birth_precision?: string
          deceased_at?: string | null
          deleted_at?: string | null
          ear_tag?: string | null
          group_age_weeks?: number | null
          head_count?: number | null
          housing?: string | null
          id: string
          identification_notes?: string | null
          kind?: string
          last_modified_by_device_id?: string | null
          leg_ring?: string | null
          microchip_id?: string | null
          name: string
          patient_code: string
          purpose?: string
          server_version?: number
          sex?: string | null
          species: string
          status?: string
          updated_at?: string
          vet_id: string
        }
        Update: {
          breed?: string | null
          color_markings?: string | null
          created_at?: string
          created_by_device_id?: string | null
          date_of_birth?: string | null
          date_of_birth_precision?: string
          deceased_at?: string | null
          deleted_at?: string | null
          ear_tag?: string | null
          group_age_weeks?: number | null
          head_count?: number | null
          housing?: string | null
          id?: string
          identification_notes?: string | null
          kind?: string
          last_modified_by_device_id?: string | null
          leg_ring?: string | null
          microchip_id?: string | null
          name?: string
          patient_code?: string
          purpose?: string
          server_version?: number
          sex?: string | null
          species?: string
          status?: string
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_exam_findings: {
        Row: {
          created_at: string
          created_by_device_id: string | null
          deleted_at: string | null
          examined_at: string | null
          id: string
          last_modified_by_device_id: string | null
          remarks: string | null
          server_version: number
          status: string
          system_name: string
          updated_at: string
          vet_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          examined_at?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          remarks?: string | null
          server_version?: number
          status?: string
          system_name: string
          updated_at?: string
          vet_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          created_by_device_id?: string | null
          deleted_at?: string | null
          examined_at?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          remarks?: string | null
          server_version?: number
          status?: string
          system_name?: string
          updated_at?: string
          vet_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "physical_exam_findings_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_exam_findings_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_exam_findings_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_exam_findings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      vet_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string
          id: string
          last_authenticated_at: string
          last_seen_at: string | null
          platform: string
          revoked_at: string | null
          server_version: number
          updated_at: string
          vet_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name: string
          id: string
          last_authenticated_at: string
          last_seen_at?: string | null
          platform: string
          revoked_at?: string | null
          server_version?: number
          updated_at?: string
          vet_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string
          id?: string
          last_authenticated_at?: string
          last_seen_at?: string | null
          platform?: string
          revoked_at?: string | null
          server_version?: number
          updated_at?: string
          vet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vet_devices_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
      vets: {
        Row: {
          account_status: string
          auth_user_id: string
          business_name: string | null
          created_at: string
          full_name: string
          id: string
          license_number: string | null
          license_verified: boolean
          phone_display: string
          phone_e164: string
          server_version: number
          service_areas: string[]
          updated_at: string
          whatsapp_display: string | null
          whatsapp_e164: string | null
        }
        Insert: {
          account_status?: string
          auth_user_id: string
          business_name?: string | null
          created_at?: string
          full_name: string
          id?: string
          license_number?: string | null
          license_verified?: boolean
          phone_display: string
          phone_e164: string
          server_version?: number
          service_areas?: string[]
          updated_at?: string
          whatsapp_display?: string | null
          whatsapp_e164?: string | null
        }
        Update: {
          account_status?: string
          auth_user_id?: string
          business_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          license_number?: string | null
          license_verified?: boolean
          phone_display?: string
          phone_e164?: string
          server_version?: number
          service_areas?: string[]
          updated_at?: string
          whatsapp_display?: string | null
          whatsapp_e164?: string | null
        }
        Relationships: []
      }
      visit_amendments: {
        Row: {
          amendment_text: string
          created_at: string
          created_by_device_id: string | null
          id: string
          reason: string
          server_version: number
          signed_at: string
          structured_changes: Json
          vet_id: string
          visit_id: string
        }
        Insert: {
          amendment_text: string
          created_at?: string
          created_by_device_id?: string | null
          id: string
          reason: string
          server_version?: number
          signed_at?: string
          structured_changes?: Json
          vet_id: string
          visit_id: string
        }
        Update: {
          amendment_text?: string
          created_at?: string
          created_by_device_id?: string | null
          id?: string
          reason?: string
          server_version?: number
          signed_at?: string
          structured_changes?: Json
          vet_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_amendments_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_amendments_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_amendments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_invoices: {
        Row: {
          amount_paid_pesewas: number
          client_id: string
          created_at: string
          created_by_device_id: string | null
          currency: string
          deleted_at: string | null
          discount_pesewas: number
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          last_modified_by_device_id: string | null
          notes: string | null
          paid_at: string | null
          server_version: number
          status: string
          subtotal_pesewas: number
          total_pesewas: number
          updated_at: string
          vet_id: string
          visit_id: string | null
          void_reason: string | null
        }
        Insert: {
          amount_paid_pesewas?: number
          client_id: string
          created_at?: string
          created_by_device_id?: string | null
          currency?: string
          deleted_at?: string | null
          discount_pesewas?: number
          due_at?: string | null
          id: string
          invoice_number: string
          issued_at?: string | null
          last_modified_by_device_id?: string | null
          notes?: string | null
          paid_at?: string | null
          server_version?: number
          status?: string
          subtotal_pesewas?: number
          total_pesewas?: number
          updated_at?: string
          vet_id: string
          visit_id?: string | null
          void_reason?: string | null
        }
        Update: {
          amount_paid_pesewas?: number
          client_id?: string
          created_at?: string
          created_by_device_id?: string | null
          currency?: string
          deleted_at?: string | null
          discount_pesewas?: number
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          last_modified_by_device_id?: string | null
          notes?: string | null
          paid_at?: string | null
          server_version?: number
          status?: string
          subtotal_pesewas?: number
          total_pesewas?: number
          updated_at?: string
          vet_id?: string
          visit_id?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_invoices_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_invoices_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_invoices_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_invoices_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          appointment_id: string | null
          body_condition_score: string | null
          chief_complaint: string | null
          completed_at: string | null
          created_at: string
          created_by_device_id: string | null
          current_medications: string | null
          definitive_diagnosis: string | null
          deleted_at: string | null
          differential_diagnoses: string | null
          follow_up_plan: string | null
          heart_rate_bpm: number | null
          history_of_complaint: string | null
          id: string
          last_modified_by_device_id: string | null
          next_review_date: string | null
          pain_score: string | null
          past_medical_history: string | null
          patient_id: string
          prescriptions: string | null
          problem_list: string | null
          respiratory_rate_bpm: number | null
          server_version: number
          signed_at: string | null
          temperature_c: number | null
          tentative_diagnosis: string | null
          treatment_plan: string | null
          updated_at: string
          vet_id: string
          visit_date: string
          visit_type: string
          void_reason: string | null
          voided_at: string | null
          weight_unit: string
          weight_value: number | null
          workflow_status: string
        }
        Insert: {
          appointment_id?: string | null
          body_condition_score?: string | null
          chief_complaint?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_device_id?: string | null
          current_medications?: string | null
          definitive_diagnosis?: string | null
          deleted_at?: string | null
          differential_diagnoses?: string | null
          follow_up_plan?: string | null
          heart_rate_bpm?: number | null
          history_of_complaint?: string | null
          id: string
          last_modified_by_device_id?: string | null
          next_review_date?: string | null
          pain_score?: string | null
          past_medical_history?: string | null
          patient_id: string
          prescriptions?: string | null
          problem_list?: string | null
          respiratory_rate_bpm?: number | null
          server_version?: number
          signed_at?: string | null
          temperature_c?: number | null
          tentative_diagnosis?: string | null
          treatment_plan?: string | null
          updated_at?: string
          vet_id: string
          visit_date: string
          visit_type: string
          void_reason?: string | null
          voided_at?: string | null
          weight_unit?: string
          weight_value?: number | null
          workflow_status?: string
        }
        Update: {
          appointment_id?: string | null
          body_condition_score?: string | null
          chief_complaint?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_device_id?: string | null
          current_medications?: string | null
          definitive_diagnosis?: string | null
          deleted_at?: string | null
          differential_diagnoses?: string | null
          follow_up_plan?: string | null
          heart_rate_bpm?: number | null
          history_of_complaint?: string | null
          id?: string
          last_modified_by_device_id?: string | null
          next_review_date?: string | null
          pain_score?: string | null
          past_medical_history?: string | null
          patient_id?: string
          prescriptions?: string | null
          problem_list?: string | null
          respiratory_rate_bpm?: number | null
          server_version?: number
          signed_at?: string | null
          temperature_c?: number | null
          tentative_diagnosis?: string | null
          treatment_plan?: string | null
          updated_at?: string
          vet_id?: string
          visit_date?: string
          visit_type?: string
          void_reason?: string | null
          voided_at?: string | null
          weight_unit?: string
          weight_value?: number | null
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_last_modified_by_device_id_fkey"
            columns: ["last_modified_by_device_id"]
            isOneToOne: false
            referencedRelation: "vet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_item_stock: {
        Row: {
          active: boolean | null
          available_quantity: number | null
          expired_quantity: number | null
          is_low_stock: boolean | null
          item_id: string | null
          item_name: string | null
          item_type: string | null
          reorder_threshold: number | null
          total_quantity_on_hand: number | null
          unit: string | null
          vet_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_vet_id_fkey"
            columns: ["vet_id"]
            isOneToOne: false
            referencedRelation: "vets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_invoice_item: {
        Args: {
          p_description: string
          p_device_id?: string
          p_id: string
          p_invoice_id: string
          p_quantity: number
          p_sequence_number?: number
          p_unit_price_pesewas: number
        }
        Returns: string
      }
      add_route_stop: {
        Args: {
          p_appointment_id: string
          p_device_id?: string
          p_estimated_arrival?: string
          p_id: string
          p_route_id: string
          p_sequence_number?: number
        }
        Returns: string
      }
      adjust_inventory: {
        Args: {
          p_batch_id: string
          p_device_id?: string
          p_movement_id: string
          p_quantity_delta: number
          p_reason: string
        }
        Returns: string
      }
      complete_vet_onboarding: {
        Args: {
          p_business_name?: string
          p_full_name: string
          p_license_number?: string
          p_phone_display: string
          p_phone_e164: string
          p_service_areas?: string[]
          p_whatsapp_display?: string
          p_whatsapp_e164?: string
        }
        Returns: string
      }
      complete_visit: {
        Args: { p_device_id?: string; p_visit_id: string }
        Returns: undefined
      }
      confirm_attachment_upload: {
        Args: { p_checksum_sha256: string; p_device_id?: string; p_id: string }
        Returns: undefined
      }
      create_appointment: {
        Args: {
          p_appointment_type: string
          p_client_id?: string
          p_contact_name?: string
          p_contact_phone_display?: string
          p_contact_phone_e164?: string
          p_device_id?: string
          p_id: string
          p_patient_id?: string
          p_reason_for_visit?: string
          p_scheduled_end?: string
          p_scheduled_start?: string
          p_travel_notes?: string
          p_visit_address?: string
          p_visit_latitude?: number
          p_visit_longitude?: number
        }
        Returns: string
      }
      create_client: {
        Args: {
          p_address?: string
          p_client_code: string
          p_communication_consent?: boolean
          p_device_id?: string
          p_email?: string
          p_id: string
          p_location_latitude?: number
          p_location_longitude?: number
          p_name: string
          p_notes?: string
          p_phone_display: string
          p_phone_e164: string
          p_whatsapp_display?: string
          p_whatsapp_e164?: string
        }
        Returns: string
      }
      create_inventory_item: {
        Args: {
          p_device_id?: string
          p_id: string
          p_item_name: string
          p_item_type: string
          p_reorder_threshold?: number
          p_unit: string
        }
        Returns: string
      }
      create_invoice: {
        Args: {
          p_client_id: string
          p_currency?: string
          p_device_id?: string
          p_discount_pesewas?: number
          p_due_at?: string
          p_id: string
          p_invoice_number: string
          p_notes?: string
          p_visit_id?: string
        }
        Returns: string
      }
      create_patient: {
        Args: {
          p_breed?: string
          p_color_markings?: string
          p_date_of_birth?: string
          p_date_of_birth_precision?: string
          p_device_id?: string
          p_ear_tag?: string
          p_group_age_weeks?: number
          p_head_count?: number
          p_housing?: string
          p_id: string
          p_identification_notes?: string
          p_kind?: string
          p_leg_ring?: string
          p_microchip_id?: string
          p_name: string
          p_patient_code: string
          p_purpose?: string
          p_sex?: string
          p_species: string
        }
        Returns: string
      }
      create_patient_owner: {
        Args: {
          p_client_id: string
          p_device_id?: string
          p_id: string
          p_is_primary?: boolean
          p_patient_id: string
          p_relationship?: string
          p_valid_from?: string
        }
        Returns: string
      }
      create_visit: {
        Args: {
          p_appointment_id?: string
          p_chief_complaint?: string
          p_device_id?: string
          p_id: string
          p_patient_id: string
          p_visit_date: string
          p_visit_type: string
        }
        Returns: string
      }
      create_visit_amendment: {
        Args: {
          p_amendment_text: string
          p_device_id?: string
          p_id: string
          p_reason: string
          p_structured_changes?: Json
          p_visit_id: string
        }
        Returns: string
      }
      delete_client: {
        Args: { p_device_id?: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      delete_patient: {
        Args: { p_device_id?: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      end_patient_owner: {
        Args: {
          p_device_id?: string
          p_id: string
          p_reason?: string
          p_valid_to: string
        }
        Returns: undefined
      }
      inventory_available_quantity: {
        Args: { p_item_id: string }
        Returns: number
      }
      issue_invoice: {
        Args: { p_device_id?: string; p_due_at?: string; p_id: string }
        Returns: undefined
      }
      mark_attachment_failed: {
        Args: { p_device_id?: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      mark_attachment_uploading: {
        Args: { p_device_id?: string; p_id: string }
        Returns: undefined
      }
      mark_remaining_systems_normal: {
        Args: { p_device_id?: string; p_visit_id: string }
        Returns: number
      }
      record_conflict_resolution: {
        Args: {
          p_device_id?: string
          p_entity_id: string
          p_entity_type: string
          p_fields?: string[]
          p_resolution: string
        }
        Returns: undefined
      }
      record_inventory_consumption: {
        Args: {
          p_batch_id: string
          p_device_id?: string
          p_movement_id: string
          p_notes?: string
          p_quantity: number
          p_visit_id: string
        }
        Returns: string
      }
      record_invoice_payment: {
        Args: {
          p_amount_pesewas: number
          p_device_id?: string
          p_id: string
          p_invoice_id: string
          p_method: string
          p_notes?: string
          p_paid_at?: string
          p_reference?: string
        }
        Returns: string
      }
      register_attachment: {
        Args: {
          p_attachment_type: string
          p_captured_at?: string
          p_device_id?: string
          p_id: string
          p_mime_type: string
          p_original_filename: string
          p_patient_id?: string
          p_size_bytes: number
          p_visit_id?: string
        }
        Returns: string
      }
      register_current_device: {
        Args: {
          p_app_version?: string
          p_device_id: string
          p_device_name: string
          p_platform: string
        }
        Returns: undefined
      }
      remove_invoice_item: {
        Args: { p_device_id?: string; p_id: string; p_reason?: string }
        Returns: undefined
      }
      remove_route_stop: {
        Args: { p_device_id?: string; p_id: string; p_reason?: string }
        Returns: undefined
      }
      resequence_route_stops: {
        Args: {
          p_device_id?: string
          p_optimization_method?: string
          p_route_id: string
          p_stop_ids: string[]
        }
        Returns: undefined
      }
      restock_inventory_batch: {
        Args: {
          p_batch_id: string
          p_batch_lot_number?: string
          p_device_id?: string
          p_expiry_date?: string
          p_item_id: string
          p_movement_id: string
          p_notes?: string
          p_quantity: number
          p_received_at?: string
          p_unit_cost_pesewas?: number
        }
        Returns: string
      }
      revoke_current_device: {
        Args: { p_device_id: string; p_reason: string }
        Returns: undefined
      }
      set_exam_finding: {
        Args: {
          p_base_server_version?: number
          p_device_id?: string
          p_remarks?: string
          p_status: string
          p_system_name: string
          p_visit_id: string
        }
        Returns: undefined
      }
      touch_current_device: {
        Args: { p_app_version?: string; p_device_id: string }
        Returns: undefined
      }
      transition_appointment_status: {
        Args: {
          p_device_id?: string
          p_expected_status?: string
          p_id: string
          p_reason?: string
          p_scheduled_end?: string
          p_scheduled_start?: string
          p_to_status: string
          p_visit_id?: string
        }
        Returns: string
      }
      update_appointment_details: {
        Args: {
          p_appointment_type: string
          p_client_id?: string
          p_contact_name?: string
          p_contact_phone_display?: string
          p_contact_phone_e164?: string
          p_device_id?: string
          p_id: string
          p_patient_id?: string
          p_reason_for_visit?: string
          p_scheduled_end?: string
          p_scheduled_start?: string
          p_travel_notes?: string
          p_visit_address?: string
          p_visit_latitude?: number
          p_visit_longitude?: number
        }
        Returns: undefined
      }
      update_client: {
        Args: {
          p_address?: string
          p_base_server_version?: number
          p_communication_consent?: boolean
          p_device_id?: string
          p_email?: string
          p_id: string
          p_location_latitude?: number
          p_location_longitude?: number
          p_name: string
          p_notes?: string
          p_phone_display: string
          p_phone_e164: string
          p_whatsapp_display?: string
          p_whatsapp_e164?: string
        }
        Returns: undefined
      }
      update_inventory_item: {
        Args: {
          p_active?: boolean
          p_device_id?: string
          p_id: string
          p_item_name: string
          p_item_type: string
          p_reorder_threshold?: number
          p_unit: string
        }
        Returns: undefined
      }
      update_patient: {
        Args: {
          p_base_server_version?: number
          p_breed?: string
          p_color_markings?: string
          p_date_of_birth?: string
          p_date_of_birth_precision?: string
          p_deceased_at?: string
          p_device_id?: string
          p_ear_tag?: string
          p_group_age_weeks?: number
          p_head_count?: number
          p_housing?: string
          p_id: string
          p_identification_notes?: string
          p_kind?: string
          p_leg_ring?: string
          p_microchip_id?: string
          p_name: string
          p_purpose?: string
          p_sex?: string
          p_species: string
          p_status?: string
        }
        Returns: undefined
      }
      update_vet_profile: {
        Args: {
          p_business_name?: string
          p_full_name: string
          p_phone_display: string
          p_phone_e164: string
          p_service_areas?: string[]
          p_whatsapp_display?: string
          p_whatsapp_e164?: string
        }
        Returns: undefined
      }
      update_visit_draft: {
        Args: {
          p_base_server_version?: number
          p_body_condition_score?: string
          p_chief_complaint?: string
          p_current_medications?: string
          p_definitive_diagnosis?: string
          p_device_id?: string
          p_differential_diagnoses?: string
          p_follow_up_plan?: string
          p_heart_rate_bpm?: number
          p_history_of_complaint?: string
          p_id: string
          p_next_review_date?: string
          p_pain_score?: string
          p_past_medical_history?: string
          p_prescriptions?: string
          p_problem_list?: string
          p_respiratory_rate_bpm?: number
          p_temperature_c?: number
          p_tentative_diagnosis?: string
          p_treatment_plan?: string
          p_visit_date: string
          p_visit_type: string
          p_weight_unit?: string
          p_weight_value?: number
        }
        Returns: undefined
      }
      upsert_daily_route: {
        Args: {
          p_device_id?: string
          p_id: string
          p_notes?: string
          p_route_date: string
        }
        Returns: string
      }
      void_invoice: {
        Args: { p_device_id?: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      void_visit: {
        Args: { p_device_id?: string; p_reason: string; p_visit_id: string }
        Returns: undefined
      }
      write_off_expired_batch: {
        Args: {
          p_batch_id: string
          p_device_id?: string
          p_movement_id: string
          p_notes?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

