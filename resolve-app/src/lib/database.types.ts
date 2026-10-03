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
      addresses: {
        Row: {
          area: string
          city: string
          complement: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          line: string
          longitude: number | null
          postal_code: string | null
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          line: string
          longitude?: number | null
          postal_code?: string | null
          state?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          area?: string
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          line?: string
          longitude?: number | null
          postal_code?: string | null
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id?: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          client_id: string
          client_last_read_at: string
          created_at: string
          id: string
          last_message_at: string
          professional_id: string
          professional_last_read_at: string
          updated_at: string
        }
        Insert: {
          client_id?: string
          client_last_read_at?: string
          created_at?: string
          id?: string
          last_message_at?: string
          professional_id: string
          professional_last_read_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_last_read_at?: string
          created_at?: string
          id?: string
          last_message_at?: string
          professional_id?: string
          professional_last_read_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          service_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          service_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          service_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          photos: string[]
          proposal_id: string | null
          request_address: Json | null
          request_id: string | null
          request_when: string | null
          sender_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          photos?: string[]
          proposal_id?: string | null
          request_address?: Json | null
          request_id?: string | null
          request_when?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          photos?: string[]
          proposal_id?: string | null
          request_address?: Json | null
          request_id?: string | null
          request_when?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: Json | null
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          client_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          professional_id: string
          proposal_id: string
          request_id: string
          scheduled_at: string | null
          scheduled_label: string
          service_id: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          address?: Json | null
          amount: number
          canceled_at?: string | null
          canceled_by?: string | null
          client_id: string
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          professional_id: string
          proposal_id: string
          request_id: string
          scheduled_at?: string | null
          scheduled_label: string
          service_id: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          address?: Json | null
          amount?: number
          canceled_at?: string | null
          canceled_by?: string | null
          client_id?: string
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          professional_id?: string
          proposal_id?: string
          request_id?: string
          scheduled_at?: string | null
          scheduled_label?: string
          service_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_services: {
        Row: {
          created_at: string
          professional_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          professional_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          base_area: string
          bio: string
          created_at: string
          id: string
          jobs_count: number
          latitude: number | null
          longitude: number | null
          rating: number
          reply_minutes: number
          review_count: number
          role_title: string
          service_radius_km: number
          tags: string[]
          updated_at: string
          verified: boolean
          years_experience: number
        }
        Insert: {
          base_area?: string
          bio?: string
          created_at?: string
          id: string
          jobs_count?: number
          latitude?: number | null
          longitude?: number | null
          rating?: number
          reply_minutes?: number
          review_count?: number
          role_title?: string
          service_radius_km?: number
          tags?: string[]
          updated_at?: string
          verified?: boolean
          years_experience?: number
        }
        Update: {
          base_area?: string
          bio?: string
          created_at?: string
          id?: string
          jobs_count?: number
          latitude?: number | null
          longitude?: number | null
          rating?: number
          reply_minutes?: number
          review_count?: number
          role_title?: string
          service_radius_km?: number
          tags?: string[]
          updated_at?: string
          verified?: boolean
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "professionals_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          amount: number
          conversation_id: string
          created_at: string
          id: string
          note: string | null
          professional_id: string
          request_id: string
          responded_at: string | null
          scheduled_at: string | null
          scheduled_label: string
          status: Database["public"]["Enums"]["proposal_status"]
        }
        Insert: {
          amount: number
          conversation_id: string
          created_at?: string
          id?: string
          note?: string | null
          professional_id?: string
          request_id: string
          responded_at?: string | null
          scheduled_at?: string | null
          scheduled_label: string
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Update: {
          amount?: number
          conversation_id?: string
          created_at?: string
          id?: string
          note?: string | null
          professional_id?: string
          request_id?: string
          responded_at?: string | null
          scheduled_at?: string | null
          scheduled_label?: string
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "proposals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          conversation_id: string | null
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          resolved_at: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_id: string
          reporter_id?: string
          resolved_at?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_addresses: {
        Row: {
          address: Json
          created_at: string
          request_id: string
        }
        Insert: {
          address: Json
          created_at?: string
          request_id: string
        }
        Update: {
          address?: Json
          created_at?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_addresses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          conversation_id: string
          created_at: string
          id: string
          service_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          service_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          client_id: string
          comment: string | null
          created_at: string
          id: string
          order_id: string
          professional_id: string
          rating: number
        }
        Insert: {
          client_id: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          professional_id: string
          rating: number
        }
        Update: {
          client_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          professional_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          area: string
          badge: string | null
          created_at: string
          description: string
          examples: string[]
          icon: string
          id: string
          includes: string[]
          is_popular: boolean
          rating: number
          review_count: number
          short_title: string
          sort_order: number
          subtitle: string
          title: string
        }
        Insert: {
          active?: boolean
          area?: string
          badge?: string | null
          created_at?: string
          description?: string
          examples?: string[]
          icon: string
          id: string
          includes?: string[]
          is_popular?: boolean
          rating?: number
          review_count?: number
          short_title: string
          sort_order?: number
          subtitle?: string
          title: string
        }
        Update: {
          active?: boolean
          area?: string
          badge?: string | null
          created_at?: string
          description?: string
          examples?: string[]
          icon?: string
          id?: string
          includes?: string[]
          is_popular?: boolean
          rating?: number
          review_count?: number
          short_title?: string
          sort_order?: number
          subtitle?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_proposal: {
        Args: { p_proposal_id: string }
        Returns: {
          address: Json | null
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          client_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          professional_id: string
          proposal_id: string
          request_id: string
          scheduled_at: string | null
          scheduled_label: string
          service_id: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_order: {
        Args: { p_order_id: string }
        Returns: {
          address: Json | null
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          client_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          professional_id: string
          proposal_id: string
          request_id: string
          scheduled_at: string | null
          scheduled_label: string
          service_id: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_request: {
        Args: { p_request_id: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          conversation_id: string
          created_at: string
          id: string
          service_id: string
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_onboarding: {
        Args: {
          p_full_name: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_order: {
        Args: { p_order_id: string }
        Returns: {
          address: Json | null
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          client_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          professional_id: string
          proposal_id: string
          request_id: string
          scheduled_at: string | null
          scheduled_label: string
          service_id: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_request: {
        Args: {
          p_address?: Json
          p_conversation_id: string
          p_description: string
          p_photos?: string[]
          p_service_id: string
          p_when: string
        }
        Returns: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          photos: string[]
          proposal_id: string | null
          request_address: Json | null
          request_id: string | null
          request_when: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_proposal: {
        Args: { p_proposal_id: string }
        Returns: {
          amount: number
          conversation_id: string
          created_at: string
          id: string
          note: string | null
          professional_id: string
          request_id: string
          responded_at: string | null
          scheduled_at: string | null
          scheduled_label: string
          status: Database["public"]["Enums"]["proposal_status"]
        }
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_account: { Args: never; Returns: undefined }
      get_contact_phone: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_professional_reviews: {
        Args: { p_limit?: number; p_professional_id: string }
        Returns: {
          client_first_name: string
          comment: string
          created_at: string
          id: string
          rating: number
          service_id: string
        }[]
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      open_conversation: {
        Args: { p_professional_id: string }
        Returns: {
          client_id: string
          client_last_read_at: string
          created_at: string
          id: string
          last_message_at: string
          professional_id: string
          professional_last_read_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      professional_distances: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          distance_km: number
          in_range: boolean
          professional_id: string
        }[]
      }
      rate_order: {
        Args: { p_comment?: string; p_order_id: string; p_rating: number }
        Returns: {
          client_id: string
          comment: string | null
          created_at: string
          id: string
          order_id: string
          professional_id: string
          rating: number
        }
        SetofOptions: {
          from: "*"
          to: "reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
    }
    Enums: {
      message_kind: "text" | "request" | "proposal" | "system"
      order_status: "combinado" | "concluido" | "cancelado"
      proposal_status: "pending" | "accepted" | "declined" | "superseded"
      user_role: "cliente" | "profissional"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      message_kind: ["text", "request", "proposal", "system"],
      order_status: ["combinado", "concluido", "cancelado"],
      proposal_status: ["pending", "accepted", "declined", "superseded"],
      user_role: ["cliente", "profissional"],
    },
  },
} as const
