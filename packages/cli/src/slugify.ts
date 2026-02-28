/**
 * Convert a string (typically a filename without extension) into a
 * URL/filesystem-safe slug.
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
    .replace(/[^a-z0-9\s-]/g, "") // strip non-alphanumeric except spaces and hyphens
    .replace(/[\s]+/g, "-") // replace spaces with hyphens
    .replace(/-{2,}/g, "-") // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
