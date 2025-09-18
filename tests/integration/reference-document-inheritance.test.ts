/**
 * Integration tests for reference document inheritance
 *
 * Tests the complete reference document resolution chain from WorkflowService
 * to FileResolutionService to ensure project → system inheritance works correctly
 * in real scenarios.
 */

import * as path from 'path';
import { WorkflowService } from '../../src/services/workflow-service';
import { TemplateService } from '../../src/services/template-service';
import { MockSystemInterface } from '../unit/mocks/mock-system-interface';
import { WorkflowFileSchema, type WorkflowFile } from '../../src/engine/schemas';
import * as YAML from 'yaml';

describe('Reference Document Inheritance Integration', () => {
  let systemRoot: string;
  let projectWorkflowsDir: string;
  let mockSystemInterface: MockSystemInterface;
  let workflowService: WorkflowService;
  let templateService: TemplateService;
  let workflow: WorkflowFile;

  beforeEach(() => {
    // Setup paths
    systemRoot = '/mock/system';
    projectWorkflowsDir = '/mock/project/.markdown-workflow/workflows';

    // Setup mock system interface
    mockSystemInterface = new MockSystemInterface();

    // Setup system workflows directory structure
    const systemWorkflowsDir = path.join(systemRoot, 'workflows', 'job');
    mockSystemInterface.addMockDirectory(systemWorkflowsDir);
    mockSystemInterface.addMockDirectory(path.join(systemWorkflowsDir, 'templates', 'resume'));
    mockSystemInterface.addMockDirectory(
      path.join(systemWorkflowsDir, 'templates', 'cover_letter'),
    );

    // Add system workflow definition
    const workflowContent = `workflow:
  name: job
  description: Job application workflow
  version: "1.0.0"

  stages:
    - name: active
      description: Active applications
      color: blue
      next: [submitted, rejected]
    - name: submitted
      description: Submitted applications
      color: yellow
      next: [interview, rejected]
    - name: rejected
      description: Rejected applications
      color: red
      terminal: true

  templates:
    - name: resume
      description: Resume template
      file: templates/resume/default.md
      output: resume_{{user.preferred_name}}.md
    - name: cover_letter
      description: Cover letter template
      file: templates/cover_letter/default.md
      output: cover_letter_{{user.preferred_name}}.md

  statics: []

  metadata:
    required_fields: ["company", "role"]
    optional_fields: ["url", "salary", "notes"]
    auto_generated: ["created", "modified"]

  collection_id:
    pattern: "{{company}}_{{role}}_{{date}}"
    max_length: 100

  actions:
    - name: format
      description: Convert to various formats
      converter: pandoc
      formats: [docx, html, pdf]`;

    mockSystemInterface.addMockFile(path.join(systemWorkflowsDir, 'workflow.yml'), workflowContent);

    // Parse and validate workflow for tests
    const parsedYaml = YAML.parse(workflowContent);
    const validationResult = WorkflowFileSchema.safeParse(parsedYaml);
    if (!validationResult.success) {
      throw new Error(`Invalid workflow: ${validationResult.error.message}`);
    }
    workflow = validationResult.data;

    // Add system reference documents
    mockSystemInterface.addMockFile(
      path.join(systemWorkflowsDir, 'templates', 'resume', 'reference.docx'),
      'System resume reference document content',
    );
    mockSystemInterface.addMockFile(
      path.join(systemWorkflowsDir, 'templates', 'cover_letter', 'reference.docx'),
      'System cover letter reference document content',
    );

    // Setup project structure
    mockSystemInterface.addMockDirectory(path.join(projectWorkflowsDir, 'job'));
    mockSystemInterface.addMockDirectory(
      path.join(projectWorkflowsDir, 'job', 'templates', 'resume'),
    );
    mockSystemInterface.addMockDirectory(
      path.join(projectWorkflowsDir, 'job', 'templates', 'cover_letter'),
    );

    // Create services
    workflowService = new WorkflowService({
      systemRoot,
      systemInterface: mockSystemInterface,
    });

    templateService = new TemplateService({
      systemRoot,
      systemInterface: mockSystemInterface,
    });
  });

  describe('Reference Document Resolution', () => {
    it('should use system reference document when no project override exists', async () => {
      // Capture console output to verify logging
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleLogs.push(args.join(' '));
      };

      try {
        // Call findReferenceDocument directly
        const referenceDoc = await workflowService.findReferenceDocument(
          workflow,
          'resume',
          projectWorkflowsDir,
        );

        // Verify that system reference document was found
        expect(referenceDoc).toBe('/mock/system/workflows/job/templates/resume/reference.docx');

        // Verify that system reference document log was created
        const referenceLogEntry = consoleLogs.find(
          (log) => log.includes('Using reference document') && log.includes('(system)'),
        );
        expect(referenceLogEntry).toBeDefined();
        expect(referenceLogEntry).toContain('templates/resume/reference.docx');
      } finally {
        console.log = originalLog;
      }
    });

    it('should use project reference document when project override exists', async () => {
      // Setup: Add project reference document that overrides system
      const projectReferencePath = path.join(
        projectWorkflowsDir,
        'job',
        'templates',
        'resume',
        'reference.docx',
      );
      mockSystemInterface.addMockFile(
        projectReferencePath,
        'Project-specific resume reference document content',
      );

      // Capture console output to verify logging
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleLogs.push(args.join(' '));
      };

      try {
        // Call findReferenceDocument directly
        const referenceDoc = await workflowService.findReferenceDocument(
          workflow,
          'resume',
          projectWorkflowsDir,
        );

        // Verify that project reference document was found
        expect(referenceDoc).toBe(projectReferencePath);

        // Verify that project reference document log was created
        const referenceLogEntry = consoleLogs.find(
          (log) => log.includes('Using reference document') && log.includes('(project)'),
        );
        expect(referenceLogEntry).toBeDefined();
        expect(referenceLogEntry).toContain('templates/resume/reference.docx');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle different template types correctly', async () => {
      // Setup: Add project reference document only for cover letter
      const projectCoverLetterReferencePath = path.join(
        projectWorkflowsDir,
        'job',
        'templates',
        'cover_letter',
        'reference.docx',
      );
      mockSystemInterface.addMockFile(
        projectCoverLetterReferencePath,
        'Project-specific cover letter reference document content',
      );

      // Test resume (should use system)
      const resumeReferenceDoc = await workflowService.findReferenceDocument(
        workflow,
        'resume',
        projectWorkflowsDir,
      );
      expect(resumeReferenceDoc).toBe('/mock/system/workflows/job/templates/resume/reference.docx');

      // Test cover letter (should use project)
      const coverLetterReferenceDoc = await workflowService.findReferenceDocument(
        workflow,
        'cover_letter',
        projectWorkflowsDir,
      );
      expect(coverLetterReferenceDoc).toBe(projectCoverLetterReferencePath);
    });

    it('should work when no reference document exists', async () => {
      // Setup: Remove all reference documents
      mockSystemInterface.removeMockFile(
        '/mock/system/workflows/job/templates/resume/reference.docx',
      );
      mockSystemInterface.removeMockFile(
        '/mock/system/workflows/job/templates/cover_letter/reference.docx',
      );

      // Test resume (should return undefined)
      const resumeReferenceDoc = await workflowService.findReferenceDocument(
        workflow,
        'resume',
        projectWorkflowsDir,
      );
      expect(resumeReferenceDoc).toBeUndefined();

      // Test cover letter (should return undefined)
      const coverLetterReferenceDoc = await workflowService.findReferenceDocument(
        workflow,
        'cover_letter',
        projectWorkflowsDir,
      );
      expect(coverLetterReferenceDoc).toBeUndefined();
    });

    it('should handle null project paths gracefully', async () => {
      // Test with null project workflows directory
      const resumeReferenceDoc = await workflowService.findReferenceDocument(
        workflow,
        'resume',
        null, // No project workflows directory
      );

      // Should fall back to system reference document
      expect(resumeReferenceDoc).toBe('/mock/system/workflows/job/templates/resume/reference.docx');
    });
  });

  describe('Template Inheritance', () => {
    it('should use project template when available', async () => {
      // Setup: Add project template override
      const projectTemplatePath = path.join(
        projectWorkflowsDir,
        'job',
        'templates',
        'resume',
        'default.md',
      );
      mockSystemInterface.addMockFile(
        projectTemplatePath,
        '# Project Resume Template\n\nName: {{user.name}}\nProject-specific content',
      );

      // Add system template for fallback
      const systemTemplatePath = path.join(
        systemRoot,
        'workflows',
        'job',
        'templates',
        'resume',
        'default.md',
      );
      mockSystemInterface.addMockFile(
        systemTemplatePath,
        '# System Resume Template\n\nName: {{user.name}}\nSystem content',
      );

      // Capture console output to verify template loading
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleLogs.push(args.join(' '));
      };

      try {
        // Load template with inheritance - should use project template
        const content = await templateService.loadTemplateWithInheritance(workflow, 'resume', {
          systemRoot,
          workflowName: 'job',
          projectPaths: { workflowsDir: projectWorkflowsDir },
        });

        expect(content).toContain('Project-specific content');

        // Verify that project template was loaded
        const templateLogEntry = consoleLogs.find(
          (log) => log.includes('Loading template') && log.includes('(project)'),
        );
        expect(templateLogEntry).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should fall back to system template when project template missing', async () => {
      // Setup: Only system template exists
      const systemTemplatePath = path.join(
        systemRoot,
        'workflows',
        'job',
        'templates',
        'resume',
        'default.md',
      );
      mockSystemInterface.addMockFile(
        systemTemplatePath,
        '# System Resume Template\n\nName: {{user.name}}\nSystem content',
      );

      // Capture console output to verify template loading
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleLogs.push(args.join(' '));
      };

      try {
        // Load template with inheritance - should use system template
        const content = await templateService.loadTemplateWithInheritance(workflow, 'resume', {
          systemRoot,
          workflowName: 'job',
          projectPaths: { workflowsDir: projectWorkflowsDir },
        });

        expect(content).toContain('System content');

        // Verify that system template was loaded
        const templateLogEntry = consoleLogs.find(
          (log) => log.includes('Loading template') && log.includes('(system)'),
        );
        expect(templateLogEntry).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing workflow template gracefully', async () => {
      // Should throw appropriate error for non-existent template
      await expect(
        templateService.loadTemplateWithInheritance(workflow, 'nonexistent_template', {
          systemRoot,
          workflowName: 'job',
          projectPaths: { workflowsDir: projectWorkflowsDir },
        }),
      ).rejects.toThrow("Template 'nonexistent_template' not found");
    });

    it('should handle invalid template type in reference document resolution', async () => {
      // Test with invalid template type
      const referenceDoc = await workflowService.findReferenceDocument(
        workflow,
        'invalid_template_type',
        projectWorkflowsDir,
      );

      // Should return undefined for non-existent template type
      expect(referenceDoc).toBeUndefined();
    });
  });
});
