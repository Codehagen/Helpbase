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
      account: {
        Row: {
          accessToken: string | null
          accessTokenExpiresAt: string | null
          accountId: string
          createdAt: string
          id: string
          idToken: string | null
          password: string | null
          providerId: string
          refreshToken: string | null
          refreshTokenExpiresAt: string | null
          scope: string | null
          updatedAt: string
          userId: string
        }
        Insert: {
          accessToken?: string | null
          accessTokenExpiresAt?: string | null
          accountId: string
          createdAt?: string
          id: string
          idToken?: string | null
          password?: string | null
          providerId: string
          refreshToken?: string | null
          refreshTokenExpiresAt?: string | null
          scope?: string | null
          updatedAt?: string
          userId: string
        }
        Update: {
          accessToken?: string | null
          accessTokenExpiresAt?: string | null
          accountId?: string
          createdAt?: string
          id?: string
          idToken?: string | null
          password?: string | null
          providerId?: string
          refreshToken?: string | null
          refreshTokenExpiresAt?: string | null
          scope?: string | null
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      deviceCode: {
        Row: {
          clientId: string | null
          createdAt: string
          deviceCode: string
          expiresAt: string
          id: string
          lastPolledAt: string | null
          pollingInterval: number | null
          scope: string | null
          status: string
          updatedAt: string
          userCode: string
          userId: string | null
        }
        Insert: {
          clientId?: string | null
          createdAt?: string
          deviceCode: string
          expiresAt: string
          id: string
          lastPolledAt?: string | null
          pollingInterval?: number | null
          scope?: string | null
          status: string
          updatedAt?: string
          userCode: string
          userId?: string | null
        }
        Update: {
          clientId?: string | null
          createdAt?: string
          deviceCode?: string
          expiresAt?: string
          id?: string
          lastPolledAt?: string | null
          pollingInterval?: number | null
          scope?: string | null
          status?: string
          updatedAt?: string
          userCode?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deviceCode_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
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
        Relationships: [
          {
            foreignKeyName: "llm_usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      session: {
        Row: {
          createdAt: string
          expiresAt: string
          id: string
          ipAddress: string | null
          token: string
          updatedAt: string
          userAgent: string | null
          userId: string
        }
        Insert: {
          createdAt?: string
          expiresAt: string
          id: string
          ipAddress?: string | null
          token: string
          updatedAt?: string
          userAgent?: string | null
          userId: string
        }
        Update: {
          createdAt?: string
          expiresAt?: string
          id?: string
          ipAddress?: string | null
          token?: string
          updatedAt?: string
          userAgent?: string | null
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "tenant_articles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "tenant_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "tenant_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "tenant_deploys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "tenant_mcp_queries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          auto_provisioned_at: string | null
          created_at: string
          deployed_at: string | null
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
          auto_provisioned_at?: string | null
          created_at?: string
          deployed_at?: string | null
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
          auto_provisioned_at?: string | null
          created_at?: string
          deployed_at?: string | null
          id?: string
          mcp_calls_today?: number
          mcp_public_token?: string
          name?: string
          owner_id?: string
          slug?: string
          theme_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          createdAt: string
          email: string
          emailVerified: boolean
          id: string
          image: string | null
          name: string
          updatedAt: string
        }
        Insert: {
          createdAt?: string
          email: string
          emailVerified?: boolean
          id: string
          image?: string | null
          name: string
          updatedAt?: string
        }
        Update: {
          createdAt?: string
          email?: string
          emailVerified?: boolean
          id?: string
          image?: string | null
          name?: string
          updatedAt?: string
        }
        Relationships: []
      }
      verification: {
        Row: {
          createdAt: string | null
          expiresAt: string
          id: string
          identifier: string
          updatedAt: string | null
          value: string
        }
        Insert: {
          createdAt?: string | null
          expiresAt: string
          id: string
          identifier: string
          updatedAt?: string | null
          value: string
        }
        Update: {
          createdAt?: string | null
          expiresAt?: string
          id?: string
          identifier?: string
          updatedAt?: string | null
          value?: string
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
      tenants_public: {
        Row: {
          active: boolean | null
          deployed_at: string | null
          id: string | null
          name: string | null
          slug: string | null
          theme_config: Json | null
        }
        Insert: {
          active?: boolean | null
          deployed_at?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          theme_config?: Json | null
        }
        Update: {
          active?: boolean | null
          deployed_at?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          theme_config?: Json | null
        }
        Relationships: []
      }
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
      increment_global_tokens: {
        Args: { p_day: string; p_delta: number }
        Returns: number
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
  public: {
    Enums: {},
  },
} as const
