/**
 * Convert a string to a URL-safe slug.
 * Used for article slugs, category slugs, and heading IDs.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Convert a kebab-case slug back to Title Case.
 * Used for deriving category titles from directory names.
 */
export function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
