import {
  WorkflowStage,
  WorkflowTemplate,
  WorkflowActionParameter,
  UserConfig,
  SystemConfig,
  ProjectConfig,
  ConfigPaths,
  CollectionMetadata,
  Collection,
  CliContext,
} from '../../../src/engine/types.js';

describe('Type Definitions', () => {
  describe('WorkflowStage', () => {
    it('should have required properties', () => {
      const stage: WorkflowStage = {
        name: 'active',
        description: 'Active applications',
        color: '#blue',
      };

      expect(stage.name).toBe('active');
      expect(stage.description).toBe('Active applications');
      expect(stage.color).toBe('#blue');
    });

    it('should support optional properties', () => {
      const stage: WorkflowStage = {
        name: 'rejected',
        description: 'Rejected applications',
        color: '#red',
        next: ['archived'],
        terminal: true,
      };

      expect(stage.next).toEqual(['archived']);
      expect(stage.terminal).toBe(true);
    });
  });

  describe('WorkflowTemplate', () => {
    it('should define template structure', () => {
      const template: WorkflowTemplate = {
        name: 'resume',
        file: 'templates/resume/default.md',
        output: 'resume_{{user.name}}.md',
        description: 'Resume template',
      };

      expect(template.name).toBe('resume');
      expect(template.file).toBe('templates/resume/default.md');
      expect(template.output).toBe('resume_{{user.name}}.md');
      expect(template.description).toBe('Resume template');
    });
  });

  describe('WorkflowActionParameter', () => {
    it('should support different parameter types', () => {
      const stringParam: WorkflowActionParameter = {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Title field',
      };

      const enumParam: WorkflowActionParameter = {
        name: 'status',
        type: 'enum',
        options: ['active', 'completed'],
        default: 'active',
        description: 'Status field',
      };

      expect(stringParam.type).toBe('string');
      expect(enumParam.type).toBe('enum');
      expect(enumParam.options).toEqual(['active', 'completed']);
      expect(enumParam.default).toBe('active');
    });

    it('should support various default value types', () => {
      const stringDefault: WorkflowActionParameter = {
        name: 'name',
        type: 'string',
        default: 'default name',
        description: 'Name field',
      };

      const numberDefault: WorkflowActionParameter = {
        name: 'count',
        type: 'number',
        default: 5,
        description: 'Count field',
      };

      const booleanDefault: WorkflowActionParameter = {
        name: 'enabled',
        type: 'boolean',
        default: true,
        description: 'Enabled field',
      };

      const arrayDefault: WorkflowActionParameter = {
        name: 'tags',
        type: 'array',
        default: ['tag1', 'tag2'],
        description: 'Tags field',
      };

      expect(stringDefault.default).toBe('default name');
      expect(numberDefault.default).toBe(5);
      expect(booleanDefault.default).toBe(true);
      expect(arrayDefault.default).toEqual(['tag1', 'tag2']);
    });
  });

  describe('UserConfig', () => {
    it('should define user configuration structure', () => {
      const userConfig: UserConfig = {
        name: 'John Doe',
        preferred_name: 'John',
        email: 'john@example.com',
        phone: '555-1234',
        address: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        linkedin: 'linkedin.com/in/johndoe',
        github: 'github.com/johndoe',
        website: 'johndoe.com',
      };

      expect(userConfig.name).toBe('John Doe');
      expect(userConfig.email).toBe('john@example.com');
      expect(userConfig.linkedin).toBe('linkedin.com/in/johndoe');
    });
  });

  describe('SystemConfig', () => {
    it('should define system configuration structure', () => {
      const systemConfig: SystemConfig = {
        scraper: 'wget',
        web_download: {
          timeout: 30,
          add_utf8_bom: true,
          html_cleanup: 'scripts',
        },
        output_formats: ['docx', 'html', 'pdf'],
        git: {
          auto_commit: true,
          commit_message_template: 'Add {{workflow}} collection: {{collection_id}}',
        },
        collection_id: {
          date_format: 'YYYYMMDD',
          sanitize_spaces: '_',
          max_length: 50,
        },
      };

      expect(systemConfig.scraper).toBe('wget');
      expect(systemConfig.web_download.timeout).toBe(30);
      expect(systemConfig.output_formats).toEqual(['docx', 'html', 'pdf']);
      expect(systemConfig.git.auto_commit).toBe(true);
    });

    it('should support different scraper types', () => {
      const wgetConfig: SystemConfig['scraper'] = 'wget';
      const curlConfig: SystemConfig['scraper'] = 'curl';
      const nativeConfig: SystemConfig['scraper'] = 'native';

      expect(wgetConfig).toBe('wget');
      expect(curlConfig).toBe('curl');
      expect(nativeConfig).toBe('native');
    });
  });

  describe('ProjectConfig', () => {
    it('should combine user and system config', () => {
      const projectConfig: ProjectConfig = {
        user: {
          name: 'Test User',
          preferred_name: 'Test',
          email: 'test@example.com',
          phone: '555-0000',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          linkedin: 'linkedin.com/in/test',
          github: 'github.com/test',
          website: 'test.com',
        },
        system: {
          scraper: 'wget',
          web_download: {
            timeout: 30,
            add_utf8_bom: true,
            html_cleanup: 'scripts',
          },
          output_formats: ['docx'],
          git: {
            auto_commit: false,
            commit_message_template: 'Custom template',
          },
          collection_id: {
            date_format: 'YYYYMMDD',
            sanitize_spaces: '_',
            max_length: 50,
          },
        },
        workflows: {
          job: {
            custom_fields: [
              {
                name: 'salary',
                type: 'string',
                description: 'Salary expectation',
              },
            ],
          },
        },
      };

      expect(projectConfig.user.name).toBe('Test User');
      expect(projectConfig.system.scraper).toBe('wget');
      expect(projectConfig.workflows.job.custom_fields).toHaveLength(1);
    });
  });

  describe('ConfigPaths', () => {
    it('should define configuration paths', () => {
      const configPaths: ConfigPaths = {
        systemRoot: '/system',
        projectRoot: '/project',
        projectConfig: '/project/.markdown-workflow/config.yml',
      };

      expect(configPaths.systemRoot).toBe('/system');
      expect(configPaths.projectRoot).toBe('/project');
      expect(configPaths.projectConfig).toBe('/project/.markdown-workflow/config.yml');
    });

    it('should support null project root', () => {
      const configPaths: ConfigPaths = {
        systemRoot: '/system',
        projectRoot: null,
      };

      expect(configPaths.projectRoot).toBeNull();
      expect(configPaths.projectConfig).toBeUndefined();
    });
  });

  describe('CollectionMetadata', () => {
    it('should define collection metadata structure', () => {
      const metadata: CollectionMetadata = {
        collection_id: 'test_collection_20240101',
        workflow: 'job',
        status: 'active',
        date_created: '2024-01-01T00:00:00Z',
        date_modified: '2024-01-01T00:00:00Z',
        status_history: [{ status: 'active', date: '2024-01-01T00:00:00Z' }],
        company: 'Test Company',
        role: 'Developer',
      };

      expect(metadata.collection_id).toBe('test_collection_20240101');
      expect(metadata.workflow).toBe('job');
      expect(metadata.status_history).toHaveLength(1);
      expect(metadata.company).toBe('Test Company');
    });
  });

  describe('Collection', () => {
    it('should define collection structure', () => {
      const collection: Collection = {
        metadata: {
          collection_id: 'test_collection_20240101',
          workflow: 'job',
          status: 'active',
          date_created: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
          status_history: [],
        },
        artifacts: ['resume.md', 'cover_letter.md'],
        path: '/collections/test_collection_20240101',
      };

      expect(collection.artifacts).toEqual(['resume.md', 'cover_letter.md']);
      expect(collection.path).toBe('/collections/test_collection_20240101');
    });
  });

  describe('CliContext', () => {
    it('should define CLI context structure', () => {
      const context: CliContext = {
        config: {
          paths: {
            systemRoot: '/system',
            projectRoot: '/project',
          },
          availableWorkflows: ['job', 'blog'],
        },
        currentWorkflow: 'job',
        currentCollection: 'test_collection_20240101',
      };

      expect(context.config.availableWorkflows).toEqual(['job', 'blog']);
      expect(context.currentWorkflow).toBe('job');
      expect(context.currentCollection).toBe('test_collection_20240101');
    });
  });
});
