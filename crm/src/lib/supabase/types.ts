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
      automation_settings: {
        Row: {
          auto_send_follow_ups: boolean
          cold_after_days: number
          daily_send_cap: number
          draft_replies: boolean
          follow_up_days: number[]
          id: boolean
          updated_at: string
        }
        Insert: {
          auto_send_follow_ups?: boolean
          cold_after_days?: number
          daily_send_cap?: number
          draft_replies?: boolean
          follow_up_days?: number[]
          id?: boolean
          updated_at?: string
        }
        Update: {
          auto_send_follow_ups?: boolean
          cold_after_days?: number
          daily_send_cap?: number
          draft_replies?: boolean
          follow_up_days?: number[]
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string
          ends_at: string
          id: string
          lead_id: string | null
          location: string
          notes: string
          outlook_change_key: string | null
          outlook_event_id: string | null
          starts_at: string
          title: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          lead_id?: string | null
          location?: string
          notes?: string
          outlook_change_key?: string | null
          outlook_event_id?: string | null
          starts_at: string
          title: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          lead_id?: string | null
          location?: string
          notes?: string
          outlook_change_key?: string | null
          outlook_event_id?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          body_override: string | null
          campaign_id: string
          created_at: string
          email: string
          error: string | null
          follow_up_sent_at: string | null
          id: string
          lead_id: string | null
          merge: Json
          replied_at: string | null
          sent_at: string | null
          skip_reason: string | null
          status: string
          step: number
          subject_override: string | null
        }
        Insert: {
          body_override?: string | null
          campaign_id: string
          created_at?: string
          email: string
          error?: string | null
          follow_up_sent_at?: string | null
          id?: string
          lead_id?: string | null
          merge?: Json
          replied_at?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          step?: number
          subject_override?: string | null
        }
        Update: {
          body_override?: string | null
          campaign_id?: string
          created_at?: string
          email?: string
          error?: string | null
          follow_up_sent_at?: string | null
          id?: string
          lead_id?: string | null
          merge?: Json
          replied_at?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          step?: number
          subject_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
      crm_users: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
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
      email_accounts: {
        Row: {
          address: string
          connected_by: string
          created_at: string
          display_name: string
          gmail_history_id: string | null
          id: string
          last_error: string | null
          last_error_at: string | null
          mailbox: string | null
          provider: string
          signature_lines: string
          signature_name: string
          signature_phone: string
          signature_title: string
          status: string
          sync_cursor: string | null
          token_secret_id: string | null
        }
        Insert: {
          address: string
          connected_by: string
          created_at?: string
          display_name?: string
          gmail_history_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          mailbox?: string | null
          provider: string
          signature_lines?: string
          signature_name?: string
          signature_phone?: string
          signature_title?: string
          status?: string
          sync_cursor?: string | null
          token_secret_id?: string | null
        }
        Update: {
          address?: string
          connected_by?: string
          created_at?: string
          display_name?: string
          gmail_history_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          mailbox?: string | null
          provider?: string
          signature_lines?: string
          signature_name?: string
          signature_phone?: string
          signature_title?: string
          status?: string
          sync_cursor?: string | null
          token_secret_id?: string | null
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          account_id: string | null
          attachments: Json
          body_text: string
          created_at: string
          created_by: string | null
          finished_at: string | null
          follow_up_after_days: number | null
          follow_up_body: string | null
          follow_up_subject: string | null
          id: string
          include_signature: boolean
          name: string
          pause_reason: string | null
          per_minute: number
          scheduled_at: string | null
          skip_contacted_days: number
          started_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          attachments?: Json
          body_text: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          follow_up_after_days?: number | null
          follow_up_body?: string | null
          follow_up_subject?: string | null
          id?: string
          include_signature?: boolean
          name?: string
          pause_reason?: string | null
          per_minute?: number
          scheduled_at?: string | null
          skip_contacted_days?: number
          started_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          attachments?: Json
          body_text?: string
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          follow_up_after_days?: number | null
          follow_up_body?: string | null
          follow_up_subject?: string | null
          id?: string
          include_signature?: boolean
          name?: string
          pause_reason?: string | null
          per_minute?: number
          scheduled_at?: string | null
          skip_contacted_days?: number
          started_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_drafts: {
        Row: {
          body_text: string
          created_at: string
          error: string | null
          follow_up_number: number | null
          id: string
          kind: string
          lead_id: string
          reply_to_message_id: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string
          to_address: string
          updated_at: string
        }
        Insert: {
          body_text: string
          created_at?: string
          error?: string | null
          follow_up_number?: number | null
          id?: string
          kind: string
          lead_id: string
          reply_to_message_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          to_address: string
          updated_at?: string
        }
        Update: {
          body_text?: string
          created_at?: string
          error?: string | null
          follow_up_number?: number | null
          id?: string
          kind?: string
          lead_id?: string
          reply_to_message_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          to_address?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          account_id: string | null
          attachments: Json
          body_text: string
          campaign_id: string | null
          cc_address: string
          conversation_id: string | null
          created_at: string
          direction: string
          error: string | null
          folder: string
          from_address: string
          from_name: string
          id: string
          lead_id: string | null
          message_id_header: string | null
          provider: string
          provider_message_id: string | null
          provider_thread_id: string | null
          read_at: string | null
          sent_by: string | null
          status: string
          subject: string
          to_address: string
        }
        Insert: {
          account_id?: string | null
          attachments?: Json
          body_text?: string
          campaign_id?: string | null
          cc_address?: string
          conversation_id?: string | null
          created_at?: string
          direction: string
          error?: string | null
          folder?: string
          from_address: string
          from_name?: string
          id?: string
          lead_id?: string | null
          message_id_header?: string | null
          provider: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          read_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          to_address: string
        }
        Update: {
          account_id?: string | null
          attachments?: Json
          body_text?: string
          campaign_id?: string | null
          cc_address?: string
          conversation_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          folder?: string
          from_address?: string
          from_name?: string
          id?: string
          lead_id?: string | null
          message_id_header?: string | null
          provider?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          read_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          to_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_campaign_fk"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason?: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_text: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_gen_runs: {
        Row: {
          claimed_at: string | null
          config: Json
          enriched: number
          error: string | null
          excluded: number
          finished_at: string | null
          found: number
          id: string
          kept: number
          params: Json
          requested_by: string | null
          stage: string | null
          started_at: string
          status: string
        }
        Insert: {
          claimed_at?: string | null
          config?: Json
          enriched?: number
          error?: string | null
          excluded?: number
          finished_at?: string | null
          found?: number
          id?: string
          kept?: number
          params?: Json
          requested_by?: string | null
          stage?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          claimed_at?: string | null
          config?: Json
          enriched?: number
          error?: string | null
          excluded?: number
          finished_at?: string | null
          found?: number
          id?: string
          kept?: number
          params?: Json
          requested_by?: string | null
          stage?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          awaiting: string | null
          business_name: string
          city: string | null
          contact_name: string | null
          contact_title: string | null
          created_at: string
          do_not_contact: boolean
          domain: string | null
          email: string
          follow_up_count: number
          follow_up_on: string | null
          id: string
          last_contacted_at: string | null
          last_reply_at: string | null
          next_action: string
          notes: string
          outreach_hook: string | null
          phone: string
          preferred_service: string
          run_id: string | null
          score: number | null
          score_breakdown: Json | null
          score_reason: string | null
          scored_at: string | null
          segment: string | null
          signals: Json | null
          source: string
          state: string | null
          status: string
          status_changed_at: string | null
          status_reason: string
          website: string | null
        }
        Insert: {
          awaiting?: string | null
          business_name: string
          city?: string | null
          contact_name?: string | null
          contact_title?: string | null
          created_at?: string
          do_not_contact?: boolean
          domain?: string | null
          email?: string
          follow_up_count?: number
          follow_up_on?: string | null
          id?: string
          last_contacted_at?: string | null
          last_reply_at?: string | null
          next_action?: string
          notes?: string
          outreach_hook?: string | null
          phone?: string
          preferred_service?: string
          run_id?: string | null
          score?: number | null
          score_breakdown?: Json | null
          score_reason?: string | null
          scored_at?: string | null
          segment?: string | null
          signals?: Json | null
          source?: string
          state?: string | null
          status?: string
          status_changed_at?: string | null
          status_reason?: string
          website?: string | null
        }
        Update: {
          awaiting?: string | null
          business_name?: string
          city?: string | null
          contact_name?: string | null
          contact_title?: string | null
          created_at?: string
          do_not_contact?: boolean
          domain?: string | null
          email?: string
          follow_up_count?: number
          follow_up_on?: string | null
          id?: string
          last_contacted_at?: string | null
          last_reply_at?: string | null
          next_action?: string
          notes?: string
          outreach_hook?: string | null
          phone?: string
          preferred_service?: string
          run_id?: string | null
          score?: number | null
          score_breakdown?: Json | null
          score_reason?: string | null
          scored_at?: string | null
          segment?: string | null
          signals?: Json | null
          source?: string
          state?: string | null
          status?: string
          status_changed_at?: string | null
          status_reason?: string
          website?: string | null
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
      worker_heartbeats: {
        Row: {
          beat_at: string
          detail: Json
          name: string
        }
        Insert: {
          beat_at?: string
          detail?: Json
          name: string
        }
        Update: {
          beat_at?: string
          detail?: Json
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      email_inbox: {
        Row: {
          business_name: string | null
          contact_name: string | null
          last_at: string | null
          last_direction: string | null
          last_snippet: string | null
          last_subject: string | null
          lead_id: string | null
          unread: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          business_name: string | null
          contact_name: string | null
          folder: string | null
          has_attachments: boolean | null
          last_at: string | null
          last_direction: string | null
          last_from_name: string | null
          last_snippet: string | null
          last_subject: string | null
          lead_id: string | null
          message_count: number | null
          other_address: string | null
          thread_key: string | null
          unread: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_business_days: { Args: { d: string; n: number }; Returns: string }
      claim_lead_gen_run: {
        Args: never
        Returns: {
          claimed_at: string | null
          config: Json
          enriched: number
          error: string | null
          excluded: number
          finished_at: string | null
          found: number
          id: string
          kept: number
          params: Json
          requested_by: string | null
          stage: string | null
          started_at: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lead_gen_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      gmail_refresh_token: { Args: { p_account_id: string }; Returns: string }
      is_crm_user: { Args: never; Returns: boolean }
      is_opt_out: { Args: { body: string }; Returns: boolean }
      mail_refresh_token: { Args: { p_account_id: string }; Returns: string }
      save_gmail_account: {
        Args: {
          p_address: string
          p_connected_by: string
          p_display_name: string
          p_refresh_token: string
        }
        Returns: string
      }
      save_mail_refresh_token: {
        Args: { p_account_id: string; p_refresh_token: string }
        Returns: undefined
      }
      save_outlook_account: {
        Args: {
          p_aliases: string[]
          p_connected_by: string
          p_display_name: string
          p_mailbox: string
          p_refresh_token: string
        }
        Returns: string
      }
      team_today: { Args: never; Returns: string }
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
    Enums: {},
  },
} as const
