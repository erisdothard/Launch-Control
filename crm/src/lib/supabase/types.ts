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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          entity_id: string
          entity_label: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          entity_id: string
          entity_label: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          entity_id?: string
          entity_label?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      company_info: {
        Row: {
          address: string
          email: string
          id: boolean
          logo_url: string | null
          name: string
          phone: string
        }
        Insert: {
          address?: string
          email?: string
          id?: boolean
          logo_url?: string | null
          name?: string
          phone?: string
        }
        Update: {
          address?: string
          email?: string
          id?: boolean
          logo_url?: string | null
          name?: string
          phone?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          business_name: string
          created_at: string
          email: string
          from_lead_id: string | null
          id: string
          notes: string
          phone: string
        }
        Insert: {
          business_name: string
          created_at?: string
          email?: string
          from_lead_id?: string | null
          id?: string
          notes?: string
          phone?: string
        }
        Update: {
          business_name?: string
          created_at?: string
          email?: string
          from_lead_id?: string | null
          id?: string
          notes?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_from_lead_id_fkey"
            columns: ["from_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          business_name: string
          created_at: string
          from_lead_id: string | null
          id: string
          notes: string
          stage: string
          value: number
        }
        Insert: {
          business_name: string
          created_at?: string
          from_lead_id?: string | null
          id?: string
          notes?: string
          stage?: string
          value?: number
        }
        Update: {
          business_name?: string
          created_at?: string
          from_lead_id?: string | null
          id?: string
          notes?: string
          stage?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_from_lead_id_fkey"
            columns: ["from_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_gen_runs: {
        Row: {
          id: string
          started_at: string
          finished_at: string | null
          status: string
          config: Json
          found: number
          enriched: number
          kept: number
          excluded: number
          error: string | null
        }
        Insert: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          config?: Json
          found?: number
          enriched?: number
          kept?: number
          excluded?: number
          error?: string | null
        }
        Update: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          config?: Json
          found?: number
          enriched?: number
          kept?: number
          excluded?: number
          error?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          business_name: string
          created_at: string
          email: string
          id: string
          notes: string
          phone: string
          preferred_service: string
          source: string
          status: string
          segment: string | null
          city: string | null
          state: string | null
          website: string | null
          domain: string | null
          contact_name: string | null
          contact_title: string | null
          score: number | null
          score_breakdown: Json | null
          score_reason: string | null
          outreach_hook: string | null
          signals: Json | null
          run_id: string | null
          scored_at: string | null
        }
        Insert: {
          business_name: string
          created_at?: string
          email: string
          id?: string
          notes?: string
          phone?: string
          preferred_service?: string
          source?: string
          status?: string
          segment?: string | null
          city?: string | null
          state?: string | null
          website?: string | null
          domain?: string | null
          contact_name?: string | null
          contact_title?: string | null
          score?: number | null
          score_breakdown?: Json | null
          score_reason?: string | null
          outreach_hook?: string | null
          signals?: Json | null
          run_id?: string | null
          scored_at?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string
          email?: string
          id?: string
          notes?: string
          phone?: string
          preferred_service?: string
          source?: string
          status?: string
          segment?: string | null
          city?: string | null
          state?: string | null
          website?: string | null
          domain?: string | null
          contact_name?: string | null
          contact_title?: string | null
          score?: number | null
          score_breakdown?: Json | null
          score_reason?: string | null
          outreach_hook?: string | null
          signals?: Json | null
          run_id?: string | null
          scored_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "lead_gen_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          related_id: string | null
          related_label: string | null
          related_type: string | null
          title: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          related_id?: string | null
          related_label?: string | null
          related_type?: string | null
          title: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          related_id?: string | null
          related_label?: string | null
          related_type?: string | null
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
