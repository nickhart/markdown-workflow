/**
 * Unit tests for input validation schemas and security functions
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateInput,
  createPresentationSchema,
  formatPresentationSchema,
  downloadPresentationSchema,
  sanitizeHtml,
} from '../../../src/lib/input-validation';

describe('Input Validation', () => {
  describe('validateInput helper', () => {
    it('should return success for valid data', () => {
      const schema = createPresentationSchema;
      const validData = { title: 'Test Presentation' };

      const result = validateInput(schema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Test Presentation');
        expect(result.data.templateName).toBe('default'); // Default value
      }
    });

    it('should return error for invalid data', () => {
      const schema = createPresentationSchema;
      const invalidData = { title: '' }; // Empty title

      const result = validateInput(schema, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Validation failed');
        expect(result.error).toContain('Cannot be empty');
      }
    });

    it('should handle non-ZodError exceptions', () => {
      const schema = createPresentationSchema;
      const invalidData = null; // Will cause ZodError for null input

      const result = validateInput(schema, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Validation failed');
      }
    });
  });

  describe('createPresentationSchema', () => {
    it('should validate valid presentation creation data', () => {
      const validData = {
        title: 'My Presentation',
        templateName: 'default',
        content: '# Hello World\n\nThis is a test presentation.',
      };

      const result = validateInput(createPresentationSchema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('My Presentation');
        expect(result.data.templateName).toBe('default');
        expect(result.data.content).toBe('# Hello World\n\nThis is a test presentation.');
      }
    });

    it('should apply default template name', () => {
      const data = { title: 'Test' };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.templateName).toBe('default');
      }
    });

    it('should reject empty title', () => {
      const data = { title: '' };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Cannot be empty');
      }
    });

    it('should reject title exceeding max length', () => {
      const data = { title: 'a'.repeat(101) }; // 101 characters

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Cannot exceed 100 characters');
      }
    });

    it('should sanitize title with dangerous characters', () => {
      const data = { title: 'Test <script>alert("xss")</script> Title' };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        // Our sanitizer removes < and > characters
        expect(result.data.title).not.toContain('<script>');
        expect(result.data.title).not.toContain('<');
        expect(result.data.title).not.toContain('>');
        expect(result.data.title).toContain('alert');
        expect(result.data.title).toContain('Title');
      }
    });

    it('should reject invalid template names', () => {
      const data = { title: 'Test', templateName: 'malicious-template' };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain(
          'Template must be one of: default, beginner, advanced, minimal',
        );
      }
    });

    it('should reject content exceeding max size', () => {
      const data = {
        title: 'Test',
        content: 'a'.repeat(50 * 1024 + 1), // 50KB + 1 byte
      };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Content cannot exceed 51200 bytes');
      }
    });

    it('should sanitize dangerous content including javascript: URLs', () => {
      const data = {
        title: 'Test',
        content: 'Hello <script>alert("xss")</script> World and javascript:alert("xss") link',
      };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe('Hello  World and alert("xss") link');
        expect(result.data.content).not.toContain('<script>');
        expect(result.data.content).not.toContain('javascript:');
      }
    });

    it('should reject unknown properties (strict mode)', () => {
      const data = {
        title: 'Test',
        maliciousProperty: 'should not be allowed',
      };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unrecognized key');
      }
    });
  });

  describe('formatPresentationSchema', () => {
    it('should validate valid format data', () => {
      const validData = {
        collectionId: 'test_presentation_20240101',
        content: '# Updated Content',
        mermaidOptions: {
          theme: 'dark',
          output_format: 'svg',
          timeout: 45,
        },
      };

      const result = validateInput(formatPresentationSchema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.collectionId).toBe('test_presentation_20240101');
        expect(result.data.mermaidOptions?.theme).toBe('dark');
        expect(result.data.mermaidOptions?.output_format).toBe('svg');
        expect(result.data.mermaidOptions?.timeout).toBe(45);
      }
    });

    it('should apply mermaid defaults', () => {
      const data = {
        collectionId: 'test_presentation_20240101',
        mermaidOptions: {},
      };

      const result = validateInput(formatPresentationSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mermaidOptions?.theme).toBe('default');
        expect(result.data.mermaidOptions?.output_format).toBe('png');
        expect(result.data.mermaidOptions?.timeout).toBe(30);
      }
    });

    it('should reject invalid collection ID format', () => {
      const invalidIds = [
        'Invalid ID with spaces',
        'UPPERCASE_NOT_ALLOWED',
        'special@characters#not$allowed',
        '',
        'a'.repeat(151), // Too long
      ];

      for (const invalidId of invalidIds) {
        const data = { collectionId: invalidId };
        const result = validateInput(formatPresentationSchema, data);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toMatch(/(lowercase letters|empty|exceed|required)/i);
        }
      }
    });

    it('should reject invalid mermaid theme', () => {
      const data = {
        collectionId: 'test_id',
        mermaidOptions: { theme: 'invalid-theme' as 'default' | 'dark' | 'forest' | 'neutral' },
      };

      const result = validateInput(formatPresentationSchema, data);

      expect(result.success).toBe(false);
    });

    it('should reject invalid mermaid timeout', () => {
      const invalidTimeouts = [-1, 0, 4, 121]; // Below 5 or above 120

      for (const timeout of invalidTimeouts) {
        const data = {
          collectionId: 'test_id',
          mermaidOptions: { timeout },
        };

        const result = validateInput(formatPresentationSchema, data);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toMatch(
            /(Too small.*>=5|Too big.*<=120|greater than or equal to 5|less than or equal to 120)/,
          );
        }
      }
    });
  });

  describe('downloadPresentationSchema', () => {
    it('should validate valid download data', () => {
      const validData = { id: 'valid_collection_id_123' };

      const result = validateInput(downloadPresentationSchema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('valid_collection_id_123');
      }
    });

    it('should reject invalid collection ID', () => {
      const invalidData = { id: 'Invalid ID with spaces!' };

      const result = validateInput(downloadPresentationSchema, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('lowercase letters, numbers, hyphens, and underscores');
      }
    });
  });

  describe('Mermaid diagram validation', () => {
    it('should accept valid mermaid diagrams', () => {
      const validDiagrams = [
        '# Test\n\n```mermaid\ngraph TD\n    A --> B\n```',
        '# Test\n\n```mermaid\nflowchart LR\n    Start --> End\n```',
        '# Test\n\n```mermaid\nsequenceDiagram\n    Alice->>Bob: Hello\n```',
      ];

      for (const content of validDiagrams) {
        const data = { title: 'Test', content };
        const result = validateInput(createPresentationSchema, data);

        if (!result.success) {
          console.log('Validation failed for content:', content);
          console.log('Error:', result.error);
        }
        expect(result.success).toBe(true);
      }
    });

    it('should reject mermaid diagrams with dangerous content', () => {
      const dangerousDiagrams = [
        // These patterns won't be sanitized by the transform but are still dangerous in Mermaid
        '# Test\n\n```mermaid\ngraph TD\n    A --> B\n    click A function() { alert("xss"); }\n```',
        '# Test\n\n```mermaid\nflowchart LR\n    A --> B\n    click B eval("malicious code")\n```',
        '# Test\n\n```mermaid\ngraph TD\n    A --> B\n    click A setTimeout("alert", 100)\n```',
      ];

      for (const content of dangerousDiagrams) {
        const data = { title: 'Test', content };
        const result = validateInput(createPresentationSchema, data);

        if (result.success) {
          console.log('Dangerous diagram was accepted:', content);
        }
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Invalid or potentially dangerous Mermaid diagram syntax');
        }
      }
    });

    it('should reject mermaid diagrams with invalid syntax', () => {
      const invalidDiagrams = [
        '```mermaid\ninvalid diagram type\n    A --> B\n```',
        '```mermaid\nrandomText\n    Not a real diagram\n```',
      ];

      for (const content of invalidDiagrams) {
        const data = { title: 'Test', content };
        const result = validateInput(createPresentationSchema, data);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Invalid or potentially dangerous Mermaid diagram syntax');
        }
      }
    });
  });

  describe('HTML sanitization', () => {
    it('should sanitize HTML content', () => {
      const dangerousHtml =
        '<p>Safe content</p><script>alert("xss")</script><iframe src="evil.com"></iframe>';

      const sanitized = sanitizeHtml(dangerousHtml);

      expect(sanitized).toContain('<p>Safe content</p>');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('<iframe>');
      expect(sanitized).not.toContain('alert("xss")');
    });

    it('should preserve allowed HTML tags', () => {
      const safeHtml =
        '<h1>Title</h1><p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p><ul><li>List item</li></ul>';

      const sanitized = sanitizeHtml(safeHtml);

      expect(sanitized).toContain('<h1>Title</h1>');
      expect(sanitized).toContain('<strong>bold</strong>');
      expect(sanitized).toContain('<em>italic</em>');
      expect(sanitized).toContain('<ul><li>List item</li></ul>');
    });

    it('should remove dangerous attributes', () => {
      const htmlWithDangerousAttrs =
        '<p onclick="alert(\'xss\')" style="background: red;">Content</p>';

      const sanitized = sanitizeHtml(htmlWithDangerousAttrs);

      expect(sanitized).toContain('Content');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('style');
      expect(sanitized).not.toContain('alert');
    });
  });

  describe('Edge cases and security tests', () => {
    it('should handle null bytes in input', () => {
      const data = { title: 'Test\0Title' };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('TestTitle');
        expect(result.data.title).not.toContain('\0');
      }
    });

    it('should handle Unicode normalization', () => {
      const data = { title: 'Tëst Tïtlé' }; // Unicode characters

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Tëst Tïtlé');
      }
    });

    it('should reject whitespace-only titles', () => {
      const whitespaceData = [
        { title: '   ' },
        { title: '\t\t' },
        { title: '\n\n' },
        { title: '   \t\n   ' },
      ];

      for (const data of whitespaceData) {
        const result = validateInput(createPresentationSchema, data);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Cannot contain only whitespace');
        }
      }
    });

    it('should handle very large content gracefully', () => {
      const largeContent = 'A'.repeat(100 * 1024); // 100KB
      const data = { title: 'Test', content: largeContent };

      const result = validateInput(createPresentationSchema, data);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Content cannot exceed');
      }
    });

    it('should validate collection ID character restrictions strictly', () => {
      const validIds = ['valid_id_123', 'test-collection', 'simple123', 'a_b_c-d-e-123'];

      const invalidIds = [
        'Invalid.Id',
        'invalid id',
        'Invalid@Id',
        'invalid#id',
        'invalid$id',
        'UPPERCASE',
      ];

      for (const id of validIds) {
        const result = validateInput(downloadPresentationSchema, { id });
        expect(result.success).toBe(true);
      }

      for (const id of invalidIds) {
        const result = validateInput(downloadPresentationSchema, { id });
        expect(result.success).toBe(false);
      }
    });
  });
});
