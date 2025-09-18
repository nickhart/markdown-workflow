import { FileResolutionService, FileResolutionOptions } from '../../../src/services/file-resolution-service';
import { MockSystemInterface } from '../mocks/mock-system-interface';

describe('FileResolutionService', () => {
  let service: FileResolutionService;
  let mockSystemInterface: MockSystemInterface;

  const baseOptions: FileResolutionOptions = {
    systemRoot: '/system/root',
    workflowName: 'job',
    projectPaths: { workflowsDir: '/project/.markdown-workflow/workflows' },
  };

  const optionsWithoutProject: FileResolutionOptions = {
    systemRoot: '/system/root',
    workflowName: 'job',
    projectPaths: null,
  };

  beforeEach(() => {
    mockSystemInterface = new MockSystemInterface();
    service = new FileResolutionService(mockSystemInterface);
  });

  describe('resolveWorkflowFile', () => {
    describe('basic file resolution', () => {
      it('should return project file when it exists (project override)', () => {
        // Setup files
        mockSystemInterface.addMockFile(
          '/project/.markdown-workflow/workflows/job/templates/resume/default.md',
          'project resume content'
        );
        mockSystemInterface.addMockFile(
          '/system/root/workflows/job/templates/resume/default.md',
          'system resume content'
        );

        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions);

        expect(result.path).toBe('/project/.markdown-workflow/workflows/job/templates/resume/default.md');
        expect(result.fromProject).toBe(true);
      });

      it('should fall back to system file when project file does not exist', () => {
        // Setup only system file
        mockSystemInterface.addMockFile(
          '/system/root/workflows/job/templates/resume/default.md',
          'system resume content'
        );

        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions);

        expect(result.path).toBe('/system/root/workflows/job/templates/resume/default.md');
        expect(result.fromProject).toBe(false);
      });

      it('should return null when file exists in neither location', () => {
        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions);

        expect(result.path).toBe(null);
        expect(result.fromProject).toBe(false);
      });

      it('should work without project paths (system only)', () => {
        mockSystemInterface.addMockFile(
          '/system/root/workflows/job/templates/resume/default.md',
          'system resume content'
        );

        const result = service.resolveWorkflowFile('templates/resume/default.md', optionsWithoutProject);

        expect(result.path).toBe('/system/root/workflows/job/templates/resume/default.md');
        expect(result.fromProject).toBe(false);
      });
    });

    describe('variant resolution', () => {
      it('should resolve variant file when it exists in project', () => {
        mockSystemInterface.addMockFile(
          '/project/.markdown-workflow/workflows/job/templates/resume/mobile.md',
          'project mobile resume'
        );

        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions, 'mobile');

        expect(result.path).toBe('/project/.markdown-workflow/workflows/job/templates/resume/mobile.md');
        expect(result.fromProject).toBe(true);
      });

      it('should resolve variant file when it exists in system', () => {
        mockSystemInterface.addMockFile(
          '/system/root/workflows/job/templates/resume/mobile.md',
          'system mobile resume'
        );

        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions, 'mobile');

        expect(result.path).toBe('/system/root/workflows/job/templates/resume/mobile.md');
        expect(result.fromProject).toBe(false);
      });

      it('should fall back to default variant when requested variant does not exist', () => {
        // Setup only default variant
        mockSystemInterface.addMockFile(
          '/system/root/workflows/job/templates/resume/default.md',
          'default resume content'
        );

        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions, 'nonexistent');

        expect(result.path).toBe('/system/root/workflows/job/templates/resume/default.md');
        expect(result.fromProject).toBe(false);
      });

      it('should return null when neither variant nor default exists', () => {
        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions, 'nonexistent');

        expect(result.path).toBe(null);
        expect(result.fromProject).toBe(false);
      });

      it('should not attempt fallback for default variant', () => {
        const result = service.resolveWorkflowFile('templates/resume/default.md', baseOptions, 'default');

        expect(result.path).toBe(null);
        expect(result.fromProject).toBe(false);
      });
    });

    describe('reference document resolution', () => {
      it('should resolve reference document from project', () => {
        mockSystemInterface.addMockFile(
          '/project/.markdown-workflow/workflows/job/templates/resume/reference.docx',
          'project reference content'
        );

        const result = service.resolveReferenceDocument('resume', baseOptions);

        expect(result.path).toBe('/project/.markdown-workflow/workflows/job/templates/resume/reference.docx');
        expect(result.fromProject).toBe(true);
      });

      it('should resolve reference document from system', () => {
        mockSystemInterface.addMockFile(
          '/system/root/workflows/job/templates/resume/reference.docx',
          'system reference content'
        );

        const result = service.resolveReferenceDocument('resume', baseOptions);

        expect(result.path).toBe('/system/root/workflows/job/templates/resume/reference.docx');
        expect(result.fromProject).toBe(false);
      });

      it('should prefer project reference over system', () => {
        mockSystemInterface.addMockFile(
          '/project/.markdown-workflow/workflows/job/templates/resume/reference.docx',
          'project reference content'
        );
        mockSystemInterface.addMockFile(
          '/system/root/workflows/job/templates/resume/reference.docx',
          'system reference content'
        );

        const result = service.resolveReferenceDocument('resume', baseOptions);

        expect(result.path).toBe('/project/.markdown-workflow/workflows/job/templates/resume/reference.docx');
        expect(result.fromProject).toBe(true);
      });
    });
  });

  describe('resolveWorkflowFilePath', () => {
    it('should return just the path for backward compatibility', () => {
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/default.md',
        'content'
      );

      const path = service.resolveWorkflowFilePath('templates/resume/default.md', baseOptions);

      expect(path).toBe('/system/root/workflows/job/templates/resume/default.md');
    });

    it('should return null when file not found', () => {
      const path = service.resolveWorkflowFilePath('templates/resume/default.md', baseOptions);

      expect(path).toBe(null);
    });
  });

  describe('resolveWorkflowFileFromCandidates', () => {
    it('should return first candidate that exists', () => {
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/cover_letter/default.md',
        'cover letter content'
      );

      const result = service.resolveWorkflowFileFromCandidates([
        'templates/resume/default.md',
        'templates/cover_letter/default.md',
        'templates/notes/default.md'
      ], baseOptions);

      expect(result.path).toBe('/system/root/workflows/job/templates/cover_letter/default.md');
      expect(result.fromProject).toBe(false);
    });

    it('should return null when no candidates exist', () => {
      const result = service.resolveWorkflowFileFromCandidates([
        'templates/resume/default.md',
        'templates/cover_letter/default.md'
      ], baseOptions);

      expect(result.path).toBe(null);
      expect(result.fromProject).toBe(false);
    });
  });

  describe('getAvailableVariants', () => {
    it('should return variants from both project and system directories', () => {
      // Setup project variants
      mockSystemInterface.addMockDirectory('/project/.markdown-workflow/workflows/job/templates/resume');
      mockSystemInterface.addMockFile(
        '/project/.markdown-workflow/workflows/job/templates/resume/default.md',
        'default'
      );
      mockSystemInterface.addMockFile(
        '/project/.markdown-workflow/workflows/job/templates/resume/mobile.md',
        'mobile'
      );
      mockSystemInterface.addMockFile(
        '/project/.markdown-workflow/workflows/job/templates/resume/ai.md',
        'ai'
      );

      // Setup system variants
      mockSystemInterface.addMockDirectory('/system/root/workflows/job/templates/resume');
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/default.md',
        'default'
      );
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/frontend.md',
        'frontend'
      );
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/ai.md',
        'ai duplicate'
      );

      const variants = service.getAvailableVariants('templates/resume/default.md', baseOptions);

      expect(variants).toEqual(['ai', 'frontend', 'mobile']); // Sorted, deduplicated
    });

    it('should handle missing directories gracefully', () => {
      const variants = service.getAvailableVariants('templates/resume/default.md', baseOptions);

      expect(variants).toEqual([]);
    });

    it('should only include files with matching extension', () => {
      mockSystemInterface.addMockDirectory('/system/root/workflows/job/templates/resume');
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/default.md',
        'default'
      );
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/mobile.md',
        'mobile'
      );
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/styles.css',
        'css file'
      );
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/templates/resume/reference.docx',
        'docx file'
      );

      const variants = service.getAvailableVariants('templates/resume/default.md', baseOptions);

      expect(variants).toEqual(['mobile']); // Only .md files, excluding original filename
    });
  });

  describe('resolveStaticFile', () => {
    it('should resolve static files using the same inheritance pattern', () => {
      mockSystemInterface.addMockFile(
        '/project/.markdown-workflow/workflows/job/assets/style.css',
        'project css'
      );
      mockSystemInterface.addMockFile(
        '/system/root/workflows/job/assets/style.css',
        'system css'
      );

      const result = service.resolveStaticFile('assets/style.css', baseOptions);

      expect(result.path).toBe('/project/.markdown-workflow/workflows/job/assets/style.css');
      expect(result.fromProject).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle system interface read errors gracefully', () => {
      // Mock a directory that exists but can't be read
      mockSystemInterface.addMockDirectory('/system/root/workflows/job/templates/resume');

      // Mock readdirSync to throw an error
      const originalReaddirSync = mockSystemInterface.readdirSync;
      mockSystemInterface.readdirSync = jest.fn().mockImplementation((path) => {
        if (path === '/system/root/workflows/job/templates/resume') {
          throw new Error('Permission denied');
        }
        return originalReaddirSync.call(mockSystemInterface, path);
      });

      const variants = service.getAvailableVariants('templates/resume/default.md', baseOptions);

      expect(variants).toEqual([]); // Should return empty array, not throw
    });

    it('should handle malformed paths gracefully', () => {
      const result = service.resolveWorkflowFile('', baseOptions);

      expect(result.path).toBe(null);
      expect(result.fromProject).toBe(false);
    });
  });

  describe('workflow name variations', () => {
    it('should work with different workflow names', () => {
      const blogOptions = { ...baseOptions, workflowName: 'blog' };

      mockSystemInterface.addMockFile(
        '/system/root/workflows/blog/templates/post/default.md',
        'blog post content'
      );

      const result = service.resolveWorkflowFile('templates/post/default.md', blogOptions);

      expect(result.path).toBe('/system/root/workflows/blog/templates/post/default.md');
    });
  });
});