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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      register_current_device: {
        Args: {
          p_app_version?: string
          p_device_id: string
          p_device_name: string
          p_platform: string
        }
        Returns: undefined
      }
      revoke_current_device: {
        Args: { p_device_id: string; p_reason: string }
        Returns: undefined
      }
      touch_current_device: {
        Args: { p_app_version?: string; p_device_id: string }
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

