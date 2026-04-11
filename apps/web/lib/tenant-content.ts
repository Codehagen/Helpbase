import { cache } from "react"
import { supabase } from "./supabase"
import type { Tables } from "@/types/supabase"

export type Tenant = Tables<"tenants">
export type TenantArticle = Tables<"tenant_articles">
export type TenantCategory = Tables<"tenant_categories">

/**
 * Look up a tenant by subdomain slug. Used by middleware and pages.
 */
export const getTenant = cache(async (slug: string): Promise<Tenant | null> => {
  const { data } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .single()
  return data
})

/**
 * Get all categories for a tenant, ordered, with article counts.
 */
export const getTenantCategories = cache(
  async (tenantId: string): Promise<(TenantCategory & { articleCount: number })[]> => {
    const { data: categories } = await supabase
      .from("tenant_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("order", { ascending: true })

    if (!categories) return []

    const { data: articles } = await supabase
      .from("tenant_articles")
      .select("category")
      .eq("tenant_id", tenantId)

    const counts = new Map<string, number>()
    for (const a of articles ?? []) {
      counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
    }

    return categories.map((c) => ({
      ...c,
      articleCount: counts.get(c.slug) ?? 0,
    }))
  }
)

/**
 * Get all articles for a tenant (for sidebar and search index).
 */
export const getTenantArticles = cache(
  async (tenantId: string): Promise<TenantArticle[]> => {
    const { data } = await supabase
      .from("tenant_articles")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("order", { ascending: true })
    return data ?? []
  }
)

/**
 * Get articles in a specific category.
 */
export const getTenantCategoryArticles = cache(
  async (tenantId: string, category: string): Promise<TenantArticle[]> => {
    const { data } = await supabase
      .from("tenant_articles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("category", category)
      .order("order", { ascending: true })
    return data ?? []
  }
)

/**
 * Get a single article by tenant, category, and slug.
 */
export const getTenantArticle = cache(
  async (
    tenantId: string,
    category: string,
    slug: string
  ): Promise<TenantArticle | null> => {
    const { data } = await supabase
      .from("tenant_articles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("category", category)
      .eq("slug", slug)
      .single()
    return data
  }
)

/**
 * Get previous and next articles for navigation.
 */
export const getAdjacentTenantArticles = cache(
  async (
    tenantId: string,
    category: string,
    slug: string
  ): Promise<{ prev: TenantArticle | null; next: TenantArticle | null }> => {
    const articles = await getTenantCategoryArticles(tenantId, category)
    const index = articles.findIndex((a) => a.slug === slug)
    return {
      prev: index > 0 ? articles[index - 1]! : null,
      next: index < articles.length - 1 ? articles[index + 1]! : null,
    }
  }
)

/**
 * Get featured articles for a tenant's homepage.
 */
export const getFeaturedTenantArticles = cache(
  async (tenantId: string): Promise<TenantArticle[]> => {
    const { data } = await supabase
      .from("tenant_articles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("featured", true)
      .order("order", { ascending: true })
      .limit(6)
    return data ?? []
  }
)
