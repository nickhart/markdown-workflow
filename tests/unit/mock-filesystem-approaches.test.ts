import {
  createFileSystemFromPaths,
  createEnhancedMockFileSystem,
  createProjectFileSystemFromPaths,
  FileSystemPaths,
} from '../helpers/file-system-helpers.js';
import { FileSystemBuilder, createCompleteTestSystem } from '../helpers/file-system-builder.js';

describe('Mock File System Approaches', () => {
  describe('Path-Based Approach', () => {
    it('should create file system from paths object', () => {
      const paths: FileSystemPaths = {
        '/system/package.json': JSON.stringify({ name: 'test-package' }),
        '/system/config.yml': 'key: value',
        '/system/data/file1.txt': 'content1',
        '/system/data/subdir/file2.txt': 'content2',
      };

      const mockFs = createFileSystemFromPaths(paths);

      expect(mockFs.existsSync('/system/package.json')).toBe(true);
      expect(mockFs.existsSync('/system/data')).toBe(true);
      expect(mockFs.existsSync('/system/data/subdir')).toBe(true);
      expect(mockFs.readFileSync('/system/package.json')).toContain('test-package');
      expect(mockFs.readFileSync('/system/data/file1.txt')).toBe('content1');
    });

    it('should handle complex workflow structure', () => {
      const mockFs = createEnhancedMockFileSystem();

      expect(mockFs.existsSync('/mock/system/package.json')).toBe(true);
      expect(mockFs.existsSync('/mock/system/workflows/job')).toBe(true);
      expect(mockFs.existsSync('/mock/system/workflows/job/templates/resume')).toBe(true);
      expect(
        mockFs.readFileSync('/mock/system/workflows/job/templates/resume/default.md'),
      ).toContain('Resume: {{user.name}}');
    });
  });

  describe('Builder Pattern Approach', () => {
    it('should create file system with fluent API', () => {
      const mockFs = new FileSystemBuilder('/test')
        .file('config.json', '{"test": true}')
        .dir('workflows')
        .dir('job')
        .file('workflow.yml', 'name: job')
        .dir('templates')
        .file('resume.md', '# Resume Template')
        .back()
        .back()
        .back()
        .build();

      expect(mockFs.existsSync('/test/config.json')).toBe(true);
      expect(mockFs.existsSync('/test/workflows/job/workflow.yml')).toBe(true);
      expect(mockFs.existsSync('/test/workflows/job/templates/resume.md')).toBe(true);
      expect(mockFs.readFileSync('/test/workflows/job/templates/resume.md')).toBe(
        '# Resume Template',
      );
    });

    it('should support workflow shortcuts', () => {
      const mockFs = new FileSystemBuilder('/system')
        .withSystemStructure()
        .withWorkflow('job', {
          templates: {
            resume: '# Resume: {{user.name}}',
            cover_letter: '# Cover Letter',
          },
        })
        .build();

      expect(mockFs.existsSync('/system/package.json')).toBe(true);
      expect(mockFs.existsSync('/system/workflows/job/workflow.yml')).toBe(true);
      expect(mockFs.existsSync('/system/workflows/job/templates/resume/default.md')).toBe(true);
    });

    it('should support multiple files at once', () => {
      const mockFs = new FileSystemBuilder('/test')
        .files({
          'file1.txt': 'content1',
          'file2.txt': 'content2',
          'file3.txt': 'content3',
        })
        .dirWithFiles('configs', {
          'config1.yml': 'key1: value1',
          'config2.yml': 'key2: value2',
        })
        .build();

      expect(mockFs.existsSync('/test/file1.txt')).toBe(true);
      expect(mockFs.existsSync('/test/configs/config1.yml')).toBe(true);
      expect(mockFs.readFileSync('/test/configs/config2.yml')).toBe('key2: value2');
    });
  });

  describe('Complete Test System', () => {
    it('should create a complete system with all workflows', () => {
      const mockFs = createCompleteTestSystem();

      expect(mockFs.existsSync('/mock/system/root/package.json')).toBe(true);
      expect(mockFs.existsSync('/mock/system/root/workflows/job')).toBe(true);
      expect(mockFs.existsSync('/mock/system/root/workflows/blog')).toBe(true);
      expect(mockFs.existsSync('/mock/system/root/workflows/job/templates/resume')).toBe(true);
      expect(mockFs.existsSync('/mock/system/root/workflows/blog/templates/post')).toBe(true);
    });
  });

  describe('Project Structure Creation', () => {
    it('should create project structure with path-based approach', () => {
      const mockFs = createProjectFileSystemFromPaths('/my/project');

      expect(mockFs.existsSync('/my/project/.markdown-workflow')).toBe(true);
      expect(mockFs.existsSync('/my/project/.markdown-workflow/config.yml')).toBe(true);
      expect(mockFs.existsSync('/my/project/.markdown-workflow/workflows')).toBe(true);
      expect(mockFs.existsSync('/my/project/.markdown-workflow/collections')).toBe(true);
    });

    it('should create project structure with builder pattern', () => {
      const mockFs = new FileSystemBuilder()
        .withProjectStructure('/test/project', 'custom:\n  config: true')
        .build();

      expect(mockFs.existsSync('/test/project/.markdown-workflow/config.yml')).toBe(true);
      expect(mockFs.readFileSync('/test/project/.markdown-workflow/config.yml')).toContain(
        'custom:',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty paths', () => {
      expect(() => createFileSystemFromPaths({})).toThrow('No paths provided');
    });

    it('should handle root-only paths', () => {
      const mockFs = createFileSystemFromPaths({
        '/file.txt': 'content',
      });

      expect(mockFs.existsSync('/file.txt')).toBe(true);
      expect(mockFs.readFileSync('/file.txt')).toBe('content');
    });

    it('should handle complex nested paths', () => {
      const mockFs = createFileSystemFromPaths({
        '/a/b/c/d/e/f/deep-file.txt': 'deep content',
      });

      expect(mockFs.existsSync('/a/b/c/d/e/f/deep-file.txt')).toBe(true);
      expect(mockFs.existsSync('/a/b/c/d/e/f')).toBe(true);
      expect(mockFs.readFileSync('/a/b/c/d/e/f/deep-file.txt')).toBe('deep content');
    });
  });

  describe('Performance Comparison', () => {
    it('should benchmark different approaches', () => {
      const iterations = 100;

      // Path-based approach
      const pathStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        createFileSystemFromPaths({
          '/system/package.json': '{"name": "test"}',
          '/system/workflows/job/workflow.yml': 'name: job',
          '/system/workflows/job/templates/resume/default.md': '# Resume',
        });
      }
      const pathTime = performance.now() - pathStart;

      // Builder pattern approach
      const builderStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        new FileSystemBuilder('/system')
          .file('package.json', '{"name": "test"}')
          .dir('workflows')
          .dir('job')
          .file('workflow.yml', 'name: job')
          .dir('templates')
          .dir('resume')
          .file('default.md', '# Resume')
          .back()
          .back()
          .back()
          .back()
          .build();
      }
      const builderTime = performance.now() - builderStart;

      // Performance comparison (uncomment to see timing details)
      // console.log(`Path-based: ${pathTime.toFixed(2)}ms`);
      // console.log(`Builder: ${builderTime.toFixed(2)}ms`);
      // console.log(`Builder overhead: ${((builderTime / pathTime - 1) * 100).toFixed(1)}%`);

      // Both should be reasonably fast
      expect(pathTime).toBeLessThan(1000);
      expect(builderTime).toBeLessThan(2000);
    });
  });
});
