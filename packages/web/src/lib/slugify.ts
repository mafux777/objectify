/**
 * Convert a string into a URL/filesystem-safe slug.
 *
 * - Lowercase
 * - Replace spaces and special characters with hyphens
 * - Strip non-alphanumeric characters (except hyphens)
 * - Collapse consecutive hyphens
 * - Trim leading/trailing hyphens
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a unique slug by appending -2, -3, etc. if the base slug is taken.
 */
export function uniqueSlug(title: string, existingSlugs: Set<string>): string {
  const base = slugify(title) || "untitled";
  if (!existingSlugs.has(base)) return base;
  let i = 2;
  while (existingSlugs.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
