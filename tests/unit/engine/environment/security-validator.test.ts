import {
  SecurityValidator,
  SecurityConfig,
  type FileInfo,
} from '../../../../src/engine/environment/security-validator.js';
import { SecurityError, ValidationError } from '../../../../src/engine/environment/environment.js';

describe('SecurityValidator', () => {
  let validator: SecurityValidator;

  beforeEach(() => {
    validator = new SecurityValidator();
  });

  describe('filename validation', () => {
    it('should accept valid filenames', () => {
      expect(() => validator.validateFilename('config.yml')).not.toThrow();
      expect(() => validator.validateFilename('workflow.yaml')).not.toThrow();
      expect(() => validator.validateFilename('template-name.md')).not.toThrow();
      expect(() => validator.validateFilename('resume_john_doe.docx')).not.toThrow();
    });

    it('should reject empty filenames', () => {
      expect(() => validator.validateFilename('')).toThrow(SecurityError);
      expect(() => validator.validateFilename('   ')).toThrow(SecurityError);
    });

    it('should reject path traversal attempts', () => {
      expect(() => validator.validateFilename('../config.yml')).toThrow(SecurityError);
      expect(() => validator.validateFilename('./config.yml')).toThrow(SecurityError);
      expect(() => validator.validateFilename('..\\config.yml')).toThrow(SecurityError);
      expect(() => validator.validateFilename('folder/../config.yml')).toThrow(SecurityError);
    });

    it('should reject absolute paths', () => {
      expect(() => validator.validateFilename('/etc/passwd')).toThrow(SecurityError);
      expect(() => validator.validateFilename('C:\\Windows\\System32')).toThrow(SecurityError);
    });

    it('should reject dangerous characters', () => {
      expect(() => validator.validateFilename('file<name.txt')).toThrow(SecurityError);
      expect(() => validator.validateFilename('file>name.txt')).toThrow(SecurityError);
      expect(() => validator.validateFilename('file:name.txt')).toThrow(SecurityError);
      expect(() => validator.validateFilename('file|name.txt')).toThrow(SecurityError);
      expect(() => validator.validateFilename('file?name.txt')).toThrow(SecurityError);
      expect(() => validator.validateFilename('file*name.txt')).toThrow(SecurityError);
      expect(() => validator.validateFilename('file\x00name.txt')).toThrow(SecurityError);
    });

    it('should reject overly long filenames', () => {
      const longName = 'a'.repeat(256);
      expect(() => validator.validateFilename(longName)).toThrow(SecurityError);
    });
  });

  describe('path validation', () => {
    it('should accept valid relative paths', () => {
      expect(() => validator.validatePath('config.yml')).not.toThrow();
      expect(() => validator.validatePath('workflows/job/workflow.yml')).not.toThrow();
      expect(() =>
        validator.validatePath('workflows/job/templates/resume/default.md'),
      ).not.toThrow();
    });

    it('should reject path traversal attempts', () => {
      expect(() => validator.validatePath('../config.yml')).toThrow(SecurityError);
      expect(() => validator.validatePath('workflows/../config.yml')).toThrow(SecurityError);
    });

    it('should reject absolute paths', () => {
      expect(() => validator.validatePath('/etc/passwd')).toThrow(SecurityError);
      expect(() => validator.validatePath('C:\\Windows\\System32')).toThrow(SecurityError);
    });

    it('should reject overly deep paths', () => {
      const deepPath = 'a/'.repeat(10) + 'file.txt';
      expect(() => validator.validatePath(deepPath)).toThrow(SecurityError);
    });
  });

  describe('extension validation', () => {
    it('should accept allowed extensions', () => {
      expect(() => validator.validateExtension('.yml')).not.toThrow();
      expect(() => validator.validateExtension('.yaml')).not.toThrow();
      expect(() => validator.validateExtension('.md')).not.toThrow();
      expect(() => validator.validateExtension('.json')).not.toThrow();
      expect(() => validator.validateExtension('.docx')).not.toThrow();
      expect(() => validator.validateExtension('.png')).not.toThrow();
    });

    it('should accept case-insensitive extensions', () => {
      expect(() => validator.validateExtension('.YML')).not.toThrow();
      expect(() => validator.validateExtension('.MD')).not.toThrow();
      expect(() => validator.validateExtension('.DOCX')).not.toThrow();
    });

    it('should reject disallowed extensions', () => {
      expect(() => validator.validateExtension('.exe')).toThrow(SecurityError);
      expect(() => validator.validateExtension('.bat')).toThrow(SecurityError);
      expect(() => validator.validateExtension('.sh')).toThrow(SecurityError);
      expect(() => validator.validateExtension('.js')).toThrow(SecurityError);
      expect(() => validator.validateExtension('.php')).toThrow(SecurityError);
    });
  });

  describe('file size validation', () => {
    it('should accept files within size limits', () => {
      expect(() => validator.validateFileSize('.yml', 50 * 1024)).not.toThrow(); // 50KB YAML
      expect(() => validator.validateFileSize('.png', 300 * 1024)).not.toThrow(); // 300KB PNG
      expect(() => validator.validateFileSize('.docx', 800 * 1024)).not.toThrow(); // 800KB DOCX
    });

    it('should reject files exceeding size limits', () => {
      expect(() => validator.validateFileSize('.yml', 200 * 1024)).toThrow(SecurityError); // 200KB YAML
      expect(() => validator.validateFileSize('.png', 600 * 1024)).toThrow(SecurityError); // 600KB PNG
      expect(() => validator.validateFileSize('.docx', 2 * 1024 * 1024)).toThrow(SecurityError); // 2MB DOCX
    });

    it('should handle extensions without defined limits', () => {
      expect(() => validator.validateFileSize('.unknown', 1024)).not.toThrow();
    });
  });

  describe('single file validation', () => {
    it('should validate valid files', () => {
      const fileInfo: FileInfo = {
        name: 'config.yml',
        path: 'config.yml',
        extension: '.yml',
        size: 50 * 1024,
        content: Buffer.from('user:\n  name: test'),
      };

      expect(() => validator.validateFile(fileInfo)).not.toThrow();
    });

    it('should reject invalid files', () => {
      const fileInfo: FileInfo = {
        name: '../config.yml',
        path: '../config.yml',
        extension: '.exe',
        size: 200 * 1024,
        content: Buffer.from('malicious content'),
      };

      expect(() => validator.validateFile(fileInfo)).toThrow(SecurityError);
    });
  });

  describe('multiple files validation', () => {
    it('should validate collections of valid files', () => {
      const files: FileInfo[] = [
        {
          name: 'config.yml',
          path: 'config.yml',
          extension: '.yml',
          size: 10 * 1024,
          content: Buffer.from('config'),
        },
        {
          name: 'workflow.yml',
          path: 'workflows/job/workflow.yml',
          extension: '.yml',
          size: 20 * 1024,
          content: Buffer.from('workflow'),
        },
      ];

      expect(() => validator.validateFiles(files)).not.toThrow();
    });

    it('should reject too many files', () => {
      const files: FileInfo[] = [];
      for (let i = 0; i < 600; i++) {
        // Exceeds default limit of 500
        files.push({
          name: `file${i}.yml`,
          path: `file${i}.yml`,
          extension: '.yml',
          size: 1024,
          content: Buffer.from('content'),
        });
      }

      expect(() => validator.validateFiles(files)).toThrow(SecurityError);
    });

    it('should reject files exceeding total size limit', () => {
      const files: FileInfo[] = [];
      for (let i = 0; i < 10; i++) {
        files.push({
          name: `large${i}.yml`,
          path: `large${i}.yml`,
          extension: '.yml',
          size: 1024 * 1024, // 1MB each, 10MB total exceeds 5MB limit
          content: Buffer.from('large content'),
        });
      }

      expect(() => validator.validateFiles(files)).toThrow(SecurityError);
    });
  });

  describe('content validation', () => {
    it('should validate YAML content', () => {
      const yamlContent = `user:
  name: "Test User"
  preferred_name: "Test"
  email: "test@example.com"
  phone: "555-123-4567"
  address: "123 Main St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "linkedin.com/in/test"
  github: "github.com/test"
  website: "test.com"
system:
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  output_formats: ["docx", "html"]
  git:
    auto_commit: false
    commit_message_template: "{{message}}"
  collection_id:
    date_format: "YYYYMMDD"
    sanitize_spaces: "_"
    max_length: 50
workflows: {}`;
      expect(() => validator.validateContent('config.yml', yamlContent)).not.toThrow();
    });

    it('should validate JSON content', () => {
      const jsonContent = '{"user": {"name": "test", "email": "test@example.com"}}';
      expect(() => validator.validateContent('config.json', jsonContent)).not.toThrow();
    });

    it('should validate markdown content', () => {
      const markdownContent = '# Title\n\nSome content here.';
      expect(() => validator.validateContent('template.md', markdownContent)).not.toThrow();
    });

    it('should reject invalid YAML', () => {
      const invalidYaml = 'user:\n  name: test\n    invalid: indentation';
      expect(() => validator.validateContent('config.yml', invalidYaml)).toThrow(ValidationError);
    });

    it('should reject invalid JSON', () => {
      const invalidJson = '{"user": {"name": "test", "email": invalid}}';
      expect(() => validator.validateContent('config.json', invalidJson)).toThrow(ValidationError);
    });

    it('should reject empty markdown', () => {
      expect(() => validator.validateContent('template.md', '')).toThrow(ValidationError);
    });

    it('should validate workflow YAML against schema', () => {
      const workflowYaml = `
workflow:
  name: "test"
  description: "Test workflow"
  version: "1.0.0"
  stages:
    - name: "active"
      description: "Active stage"
      color: "blue"
  templates: []
  statics: []
  actions: []
  metadata:
    required_fields: []
    optional_fields: []
    auto_generated: []
  collection_id:
    pattern: "test_{{date}}"
    max_length: 50
      `.trim();

      expect(() =>
        validator.validateContent('workflows/test/workflow.yml', workflowYaml),
      ).not.toThrow();
    });
  });

  describe('filename sanitization', () => {
    it('should sanitize dangerous characters', () => {
      expect(validator.sanitizeFilename('file<name>test.txt')).toBe('file_name_test.txt');
      expect(validator.sanitizeFilename('file:name|test.txt')).toBe('file_name_test.txt');
      expect(validator.sanitizeFilename('  file name  ')).toBe('file name');
    });

    it('should preserve safe characters', () => {
      expect(validator.sanitizeFilename('file-name_test.txt')).toBe('file-name_test.txt');
      expect(validator.sanitizeFilename('file.name.test.txt')).toBe('file.name.test.txt');
    });
  });

  describe('custom security config', () => {
    it('should use custom file size limits', () => {
      const customConfig: SecurityConfig = SecurityValidator.createConfig({
        fileSizeLimits: {
          '.yml': 200 * 1024, // 200KB instead of default 100KB
        },
      });

      const customValidator = new SecurityValidator(customConfig);

      // Should now accept 150KB YAML file
      expect(() => customValidator.validateFileSize('.yml', 150 * 1024)).not.toThrow();
    });

    it('should use custom allowed extensions', () => {
      const customConfig: SecurityConfig = SecurityValidator.createConfig({
        allowedExtensions: ['.txt', '.log'],
      });

      const customValidator = new SecurityValidator(customConfig);

      expect(() => customValidator.validateExtension('.txt')).not.toThrow();
      expect(() => customValidator.validateExtension('.yml')).toThrow(SecurityError);
    });

    it('should disable content validation when configured', () => {
      const customConfig: SecurityConfig = SecurityValidator.createConfig({
        enableContentValidation: false,
      });

      const customValidator = new SecurityValidator(customConfig);

      // Should not validate content even with invalid YAML
      const invalidYaml = 'invalid: yaml: content:';
      expect(() => customValidator.validateContent('config.yml', invalidYaml)).not.toThrow();
    });
  });
});
