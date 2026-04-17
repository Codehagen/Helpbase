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
      global_daily_tokens: {
        Row: {
          day: string
          tokens: number
          updated_at: string
        }
        Insert: {
          day: string
          tokens?: number
          updated_at?: string
        }
        Update: {
          day?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      llm_usage_events: {
        Row: {
          completion_tokens: number
          cost_usd: number
          created_at: string
          id: string
          latency_ms: number | null
          model: string
          prompt_tokens: number
          request_id: string | null
          route: string
          status: string
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          latency_ms?: number | null
          model: string
          prompt_tokens?: number
          request_id?: string | null
          route: string
          status: string
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string
          prompt_tokens?: number
          request_id?: string | null
          route?: string
          status?: string
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      tenant_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          description: string
          featured: boolean
          file_path: string
          frontmatter: Json
          hero_image: string | null
          id: string
          order: number
          slug: string
          tags: string[] | null
          tenant_id: string
          title: string
          updated_at: string
          video_embed: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          description?: string
          featured?: boolean
          file_path: string
          frontmatter?: Json
          hero_image?: string | null
          id?: string
          order?: number
          slug: string
          tags?: string[] | null
          tenant_id: string
          title: string
          updated_at?: string
          video_embed?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          description?: string
          featured?: boolean
          file_path?: string
          frontmatter?: Json
          hero_image?: string | null
          id?: string
          order?: number
          slug?: string
          tags?: string[] | null
          tenant_id?: string
          title?: string
          updated_at?: string
          video_embed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_articles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_categories: {
        Row: {
          created_at: string
          description: string
          icon: string | null
          id: string
          order: number
          slug: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: string
          order?: number
          slug: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: string
          order?: number
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_chunks: {
        Row: {
          article_id: string
          chunk_index: number
          content: string
          created_at: string
          file_path: string
          fts: unknown
          id: string
          line_end: number
          line_start: number
          tenant_id: string
          token_count: number
        }
        Insert: {
          article_id: string
          chunk_index: number
          content: string
          created_at?: string
          file_path: string
          fts?: unknown
          id?: string
          line_end: number
          line_start: number
          tenant_id: string
          token_count?: number
        }
        Update: {
          article_id?: string
          chunk_index?: number
          content?: string
          created_at?: string
          file_path?: string
          fts?: unknown
          id?: string
          line_end?: number
          line_start?: number
          tenant_id?: string
          token_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_chunks_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "tenant_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_deploys: {
        Row: {
          article_count: number
          chunk_count: number
          created_at: string
          deploy_id: string
          dropped_count: number
          id: string
          tenant_id: string
          validation_report: Json
        }
        Insert: {
          article_count?: number
          chunk_count?: number
          created_at?: string
          deploy_id?: string
          dropped_count?: number
          id?: string
          tenant_id: string
          validation_report?: Json
        }
        Update: {
          article_count?: number
          chunk_count?: number
          created_at?: string
          deploy_id?: string
          dropped_count?: number
          id?: string
          tenant_id?: string
          validation_report?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tenant_deploys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_mcp_queries: {
        Row: {
          created_at: string
          id: string
          matched: boolean
          query: string
          result_count: number
          tenant_id: string
          tool_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          matched?: boolean
          query?: string
          result_count?: number
          tenant_id: string
          tool_name: string
        }
        Update: {
          created_at?: string
          id?: string
          matched?: boolean
          query?: string
          result_count?: number
          tenant_id?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_mcp_queries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          mcp_calls_today: number
          mcp_public_token: string
          name: string
          owner_id: string
          slug: string
          theme_config: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          mcp_calls_today?: number
          mcp_public_token?: string
          name?: string
          owner_id: string
          slug: string
          theme_config?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          mcp_calls_today?: number
          mcp_public_token?: string
          name?: string
          owner_id?: string
          slug?: string
          theme_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      waitlist_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deploy_tenant: {
        Args: {
          p_articles: Json
          p_categories: Json
          p_chunks: Json
          p_tenant_id: string
          p_validation_report?: Json
        }
        Returns: string
      }
      get_global_tokens_today: { Args: never; Returns: number }
      get_user_tokens_today: { Args: { p_user_id: string }; Returns: number }
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
