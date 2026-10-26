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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string
          balance_minor: number
          created_at: string
          currency: string
          daily_limit_minor: number
          id: string
          is_system: boolean
          opened_at: string
          per_tx_limit_minor: number
          public_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_number?: string
          balance_minor?: number
          created_at?: string
          currency?: string
          daily_limit_minor?: number
          id?: string
          is_system?: boolean
          opened_at?: string
          per_tx_limit_minor?: number
          public_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_number?: string
          balance_minor?: number
          created_at?: string
          currency?: string
          daily_limit_minor?: number
          id?: string
          is_system?: boolean
          opened_at?: string
          per_tx_limit_minor?: number
          public_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_nonces: {
        Row: {
          created_at: string
          expires_at: string
          key_id: string
          nonce: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          key_id: string
          nonce: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          key_id?: string
          nonce?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_ref: string | null
          actor_type: string
          created_at: string
          detail: Json
          entity: string | null
          entity_ref: string | null
          id: string
        }
        Insert: {
          action: string
          actor_ref?: string | null
          actor_type: string
          created_at?: string
          detail?: Json
          entity?: string | null
          entity_ref?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_ref?: string | null
          actor_type?: string
          created_at?: string
          detail?: Json
          entity?: string | null
          entity_ref?: string | null
          id?: string
        }
        Relationships: []
      }
      beneficiaries: {
        Row: {
          account_id: string
          account_number: string
          bank_name: string
          created_at: string
          disabled_reason: string | null
          id: string
          is_internal: boolean
          name: string
          public_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          account_number: string
          bank_name: string
          created_at?: string
          disabled_reason?: string | null
          id?: string
          is_internal?: boolean
          name: string
          public_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          disabled_reason?: string | null
          id?: string
          is_internal?: boolean
          name?: string
          public_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      control_actions: {
        Row: {
          action: string
          alert_ref: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          incident_ref: string | null
          reason: string | null
          requested_by_key_id: string | null
          status: string
          target_public_id: string | null
          target_state: Json | null
          updated_at: string
        }
        Insert: {
          action: string
          alert_ref?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          incident_ref?: string | null
          reason?: string | null
          requested_by_key_id?: string | null
          status: string
          target_public_id?: string | null
          target_state?: Json | null
          updated_at?: string
        }
        Update: {
          action?: string
          alert_ref?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          incident_ref?: string | null
          reason?: string | null
          requested_by_key_id?: string | null
          status?: string
          target_public_id?: string | null
          target_state?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          created_at: string
          direction: string
          id: string
          ip_allowlist: string[] | null
          key_id: string
          label: string | null
          last_used_at: string | null
          rotated_at: string | null
          scopes: string[]
          secret_ciphertext: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          ip_allowlist?: string[] | null
          key_id: string
          label?: string | null
          last_used_at?: string | null
          rotated_at?: string | null
          scopes?: string[]
          secret_ciphertext: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          ip_allowlist?: string[] | null
          key_id?: string
          label?: string | null
          last_used_at?: string | null
          rotated_at?: string | null
          scopes?: string[]
          secret_ciphertext?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          created_at: string
          delivery_enabled: boolean
          ecs_base_url: string | null
          id: number
          last_health_check_at: string | null
          last_health_status: string | null
          source_system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_enabled?: boolean
          ecs_base_url?: string | null
          id?: number
          last_health_check_at?: string | null
          last_health_status?: string | null
          source_system?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_enabled?: boolean
          ecs_base_url?: string | null
          id?: number
          last_health_check_at?: string | null
          last_health_status?: string | null
          source_system?: string
          updated_at?: string
        }
        Relationships: []
      }
      ip_blocklist: {
        Row: {
          alert_ref: string | null
          created_at: string
          expires_at: string | null
          ip: string
          reason: string | null
          source: string
          updated_at: string
        }
        Insert: {
          alert_ref?: string | null
          created_at?: string
          expires_at?: string | null
          ip: string
          reason?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          alert_ref?: string | null
          created_at?: string
          expires_at?: string | null
          ip?: string
          reason?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount_minor: number
          balance_after_minor: number
          created_at: string
          direction: string
          id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount_minor: number
          balance_after_minor: number
          created_at?: string
          direction: string
          id?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount_minor?: number
          balance_after_minor?: number
          created_at?: string
          direction?: string
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_challenges: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          session_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          failed_login_count: number
          full_name: string
          last_failed_login_at: string | null
          last_login_at: string | null
          locked_until: string | null
          must_change_password?: boolean | null
          phone: string | null
          public_id: string
          status: string
          step_up_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          failed_login_count?: number
          full_name?: string
          last_failed_login_at?: string | null
          last_login_at?: string | null
          locked_until?: string | null
          must_change_password?: boolean | null
          phone?: string | null
          public_id?: string
          status?: string
          step_up_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          failed_login_count?: number
          full_name?: string
          last_failed_login_at?: string | null
          last_login_at?: string | null
          locked_until?: string | null
          must_change_password?: boolean | null
          phone?: string | null
          public_id?: string
          status?: string
          step_up_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          account_id_pub: string | null
          amount_minor: number | null
          attempts: number
          attributes: Json
          beneficiary_id_pub: string | null
          created_at: string
          currency: string | null
          delivered_at: string | null
          delivery_status: string
          device_id_pub: string | null
          endpoint: string | null
          event_id: string
          event_type: string
          last_error: string | null
          occurred_at: string
          result: string
          seq: number
          session_id_pub: string | null
          source_ip: string | null
          source_system: string
          transaction_id_pub: string | null
          updated_at: string
          user_id_pub: string | null
        }
        Insert: {
          account_id_pub?: string | null
          amount_minor?: number | null
          attempts?: number
          attributes?: Json
          beneficiary_id_pub?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          delivery_status?: string
          device_id_pub?: string | null
          endpoint?: string | null
          event_id?: string
          event_type: string
          last_error?: string | null
          occurred_at?: string
          result: string
          seq?: number
          session_id_pub?: string | null
          source_ip?: string | null
          source_system?: string
          transaction_id_pub?: string | null
          updated_at?: string
          user_id_pub?: string | null
        }
        Update: {
          account_id_pub?: string | null
          amount_minor?: number | null
          attempts?: number
          attributes?: Json
          beneficiary_id_pub?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          delivery_status?: string
          device_id_pub?: string | null
          endpoint?: string | null
          event_id?: string
          event_type?: string
          last_error?: string | null
          occurred_at?: string
          result?: string
          seq?: number
          session_id_pub?: string | null
          source_ip?: string | null
          source_system?: string
          transaction_id_pub?: string | null
          updated_at?: string
          user_id_pub?: string | null
        }
        Relationships: []
      }
      security_posture: {
        Row: {
          api_request_telemetry: string
          created_at: string
          high_value_threshold_minor: number
          hold_seconds_for_high_value: number
          id: number
          lab_mode: boolean
          lockout_enabled: boolean
          lockout_threshold: number
          new_device_requires_otp: boolean
          off_hours_end: string
          off_hours_start: string
          rate_limit_enabled: boolean
          rate_limit_per_min: number
          show_otp_in_ui: boolean
          updated_at: string
        }
        Insert: {
          api_request_telemetry?: string
          created_at?: string
          high_value_threshold_minor?: number
          hold_seconds_for_high_value?: number
          id?: number
          lab_mode?: boolean
          lockout_enabled?: boolean
          lockout_threshold?: number
          new_device_requires_otp?: boolean
          off_hours_end?: string
          off_hours_start?: string
          rate_limit_enabled?: boolean
          rate_limit_per_min?: number
          show_otp_in_ui?: boolean
          updated_at?: string
        }
        Update: {
          api_request_telemetry?: string
          created_at?: string
          high_value_threshold_minor?: number
          hold_seconds_for_high_value?: number
          id?: number
          lab_mode?: boolean
          lockout_enabled?: boolean
          lockout_threshold?: number
          new_device_requires_otp?: boolean
          off_hours_end?: string
          off_hours_start?: string
          rate_limit_enabled?: boolean
          rate_limit_per_min?: number
          show_otp_in_ui?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      target_devices: {
        Row: {
          created_at: string
          fingerprint_hash: string
          first_seen_at: string
          id: string
          label: string | null
          last_seen_at: string
          public_id: string
          status: string
          trusted: boolean
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint_hash: string
          first_seen_at?: string
          id?: string
          label?: string | null
          last_seen_at?: string
          public_id?: string
          status?: string
          trusted?: boolean
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint_hash?: string
          first_seen_at?: string
          id?: string
          label?: string | null
          last_seen_at?: string
          public_id?: string
          status?: string
          trusted?: boolean
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      target_sessions: {
        Row: {
          created_at: string
          device_id: string | null
          expires_at: string
          id: string
          last_seen_at: string
          public_id: string
          revoked_by: string | null
          revoked_reason: string | null
          source_ip: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          expires_at?: string
          id?: string
          last_seen_at?: string
          public_id?: string
          revoked_by?: string | null
          revoked_reason?: string | null
          source_ip?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          expires_at?: string
          id?: string
          last_seen_at?: string
          public_id?: string
          revoked_by?: string | null
          revoked_reason?: string | null
          source_ip?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "target_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "target_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_minor: number
          beneficiary_id: string | null
          completed_at: string | null
          created_at: string
          currency: string
          device_id: string | null
          failure_reason: string | null
          from_account_id: string
          frozen_at: string | null
          frozen_reason: string | null
          hold_until: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          public_id: string
          session_id: string | null
          source_ip: string | null
          status: string
          to_account_id: string | null
          updated_at: string
        }
        Insert: {
          amount_minor: number
          beneficiary_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          device_id?: string | null
          failure_reason?: string | null
          from_account_id: string
          frozen_at?: string | null
          frozen_reason?: string | null
          hold_until?: string | null
          id?: string
          idempotency_key?: string | null
          note?: string | null
          public_id?: string
          session_id?: string | null
          source_ip?: string | null
          status?: string
          to_account_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          beneficiary_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          device_id?: string | null
          failure_reason?: string | null
          from_account_id?: string
          frozen_at?: string | null
          frozen_reason?: string | null
          hold_until?: string | null
          id?: string
          idempotency_key?: string | null
          note?: string | null
          public_id?: string
          session_id?: string | null
          source_ip?: string | null
          status?: string
          to_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "customer" | "admin" | "employee"
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
      app_role: ["customer", "admin", "employee"],
    },
  },
} as const
