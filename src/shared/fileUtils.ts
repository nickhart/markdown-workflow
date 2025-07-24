/**
 * Sanitize string for use in filenames
 * - Converts to lowercase
 * - Removes special characters (keeps only alphanumeric and spaces)
 * - Replaces spaces with underscores
 * - Removes duplicate underscores
 * - Removes leading/trailing underscores
 */
export function sanitizeForFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Remove duplicate underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

/**
 * Normalize template name for filename generation
 * Similar to sanitizeForFilename but preserves more characters for template names
 */
export function normalizeTemplateName(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Remove duplicate underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}
