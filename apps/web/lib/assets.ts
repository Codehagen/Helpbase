import path from "node:path"

export class PathTraversalError extends Error {
  constructor(assetPath: string) {
    super(
      `Path traversal rejected: "${assetPath}". ` +
        `Asset paths must be relative filenames within the article's content directory. ` +
        `Do not use "..", leading "/", backslashes, or URL schemes.`,
    )
    this.name = "PathTraversalError"
  }
}

/**
 * Resolve a relative asset path to a public URL.
 *
 * Given an article at content/<category>/<slug>.mdx and a relative asset
 * path like "hero.png", returns "/_helpbase-assets/<category>/<slug>/hero.png".
 *
 * Security: rejects path traversal attempts (.., leading /, backslash,
 * null bytes, URL schemes). This is a pure string-join after sanitization,
 * NOT a filesystem operation.
 */
export function resolveAssetPath(
  category: string,
  slug: string,
  assetPath: string,
): string {
  // Reject null bytes
  if (assetPath.includes("\0")) {
    throw new PathTraversalError(assetPath)
  }

  // Reject backslashes (Windows path separators)
  if (assetPath.includes("\\")) {
    throw new PathTraversalError(assetPath)
  }

  // Reject absolute paths
  if (assetPath.startsWith("/")) {
    throw new PathTraversalError(assetPath)
  }

  // Reject URL schemes (http://, https://, javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) {
    throw new PathTraversalError(assetPath)
  }

  // Normalize and reject any traversal
  const normalized = path.posix.normalize(assetPath)
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    throw new PathTraversalError(assetPath)
  }

  // Reject if normalized path still contains ..
  if (normalized.includes("..")) {
    throw new PathTraversalError(assetPath)
  }

  return `/_helpbase-assets/${category}/${slug}/${normalized}`
}
