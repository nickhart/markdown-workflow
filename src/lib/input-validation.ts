/**
 * Input validation schemas using Zod
 * Provides comprehensive validation for all API endpoints with security-focused constraints
 */

import { z } from 'zod';

// Security constants
const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 50 * 1024; // 50KB
const MAX_COLLECTION_ID_LENGTH = 150;
const ALLOWED_TEMPLATE_NAMES = ['default', 'beginner', 'advanced', 'minimal'] as const;
const ALLOWED_MERMAID_THEMES = ['default', 'dark', 'forest', 'neutral'] as const;
const ALLOWED_MERMAID_FORMATS = ['png', 'svg'] as const;

/**
 * Sanitize string input to prevent XSS and injection attacks
 */
function sanitizeString(str: string): string {
  return str
    .trim()
    .replace(/[<>\"']/g, '') // Remove potential XSS characters
    .replace(/\0/g, '') // Remove null bytes
    .normalize('NFKC'); // Normalize Unicode
}

/**
 * Custom Zod refinement for safe strings
 */
const safeString = (maxLength: number) => 
  z.string()
    .min(1, 'Cannot be empty')
    .max(maxLength, `Cannot exceed ${maxLength} characters`)
    .transform(sanitizeString)
    .refine(
      (str) => str.length > 0, 
      'Cannot be empty after sanitization'
    )
    .refine(
      (str) => !/^\s*$/.test(str), 
      'Cannot contain only whitespace'
    );

/**
 * Validate markdown content for security
 */
const safeMarkdown = z.string()
  .max(MAX_CONTENT_LENGTH, `Content cannot exceed ${MAX_CONTENT_LENGTH} bytes`)
  .transform((content) => {
    // Basic sanitization - remove dangerous patterns
    return content
      .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove script tags
      .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '') // Remove iframe tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/data:text\/html/gi, '') // Remove data URLs
      .trim();
  })
  .refine(
    (content) => {
      // Validate Mermaid diagram syntax if present
      const mermaidBlocks = content.match(/```mermaid\n([\s\S]*?)\n```/g);
      if (mermaidBlocks) {
        for (const block of mermaidBlocks) {
          const diagram = block.replace(/```mermaid\n|\n```/g, '');
          if (!isValidMermaidSyntax(diagram)) {
            return false;
          }
        }
      }
      return true;
    },
    'Invalid or potentially dangerous Mermaid diagram syntax'
  );

/**
 * Validate Mermaid diagram syntax for security
 */
function isValidMermaidSyntax(diagram: string): boolean {
  // Check for dangerous patterns in Mermaid diagrams
  const dangerousPatterns = [
    /javascript:/i,
    /<script/i,
    /onclick/i,
    /onerror/i,
    /onload/i,
    /eval\(/i,
    /function\(/i,
    /setTimeout/i,
    /setInterval/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(diagram)) {
      return false;
    }
  }

  // Basic syntax validation - must start with known diagram types
  const validDiagramTypes = [
    'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 
    'erDiagram', 'journey', 'gantt', 'pie', 'timeline',
    'mindmap', 'gitgraph'
  ];

  const firstLine = diagram.trim().split('\n')[0].toLowerCase();
  return validDiagramTypes.some(type => firstLine.startsWith(type));
}

/**
 * Collection ID validation
 */
const collectionIdSchema = z.string()
  .min(1, 'Collection ID is required')
  .max(MAX_COLLECTION_ID_LENGTH, `Collection ID cannot exceed ${MAX_COLLECTION_ID_LENGTH} characters`)
  .regex(
    /^[a-z0-9_-]+$/,
    'Collection ID can only contain lowercase letters, numbers, hyphens, and underscores'
  );

/**
 * Template name validation (whitelist only)
 */
const templateNameSchema = z.enum(ALLOWED_TEMPLATE_NAMES, {
  message: `Template must be one of: ${ALLOWED_TEMPLATE_NAMES.join(', ')}` 
});

/**
 * Mermaid options validation
 */
const mermaidOptionsSchema = z.object({
  theme: z.enum(ALLOWED_MERMAID_THEMES).optional().default('default'),
  output_format: z.enum(ALLOWED_MERMAID_FORMATS).optional().default('png'),
  timeout: z.number().int().min(5).max(120).optional().default(30), // 5 seconds to 2 minutes
}).strict(); // Prevent additional properties

/**
 * API Request Schemas
 */

// GET /api/presentations/templates
export const getTemplatesSchema = z.object({
  // No query parameters expected
}).strict();

// POST /api/presentations/create
export const createPresentationSchema = z.object({
  title: safeString(MAX_TITLE_LENGTH),
  templateName: templateNameSchema.optional().default('default'),
  content: safeMarkdown.optional(),
}).strict();

// POST /api/presentations/format
export const formatPresentationSchema = z.object({
  collectionId: collectionIdSchema,
  content: safeMarkdown.optional(),
  mermaidOptions: mermaidOptionsSchema.optional(),
}).strict();

// GET /api/presentations/download/[id]
export const downloadPresentationSchema = z.object({
  id: collectionIdSchema,
}).strict();

/**
 * Validation helper function
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>, 
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format validation errors for security (don't expose internal details)
      const messages = error.issues.map(issue => {
        if (issue.path.length > 0) {
          return `${issue.path.join('.')}: ${issue.message}`;
        }
        return issue.message;
      });
      
      return { 
        success: false, 
        error: `Validation failed: ${messages.join(', ')}` 
      };
    }
    
    return { 
      success: false, 
      error: 'Invalid input format' 
    };
  }
}

/**
 * Content sanitization using DOMPurify (for HTML content)
 */
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

let purify: ReturnType<typeof createDOMPurify> | null = null;

function getPurify(): ReturnType<typeof createDOMPurify> {
  if (!purify) {
    const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    purify = createDOMPurify(window);
  }
  return purify;
}

/**
 * Sanitize HTML content (if needed for rich text processing)
 */
export function sanitizeHtml(html: string): string {
  const purifyInstance = getPurify();
  return purifyInstance.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'style'],
  });
}

/**
 * Export types for TypeScript
 */
export type CreatePresentationInput = z.infer<typeof createPresentationSchema>;
export type FormatPresentationInput = z.infer<typeof formatPresentationSchema>;
export type DownloadPresentationInput = z.infer<typeof downloadPresentationSchema>;
export type MermaidOptions = z.infer<typeof mermaidOptionsSchema>;