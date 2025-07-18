import { MockSystemInterface } from '../mocks/MockSystemInterface.js';

/**
 * Fluent builder for creating mock file systems
 * 
 * @example
 * ```typescript
 * const mockFs = new FileSystemBuilder()
 *   .root('/mock/system')
 *   .file('package.json', JSON.stringify({ name: 'test' }))
 *   .dir('workflows')
 *     .dir('job')
 *       .file('workflow.yml', 'workflow: job')
 *       .dir('templates')
 *         .file('resume.md', '# Resume')
 *       .back()
 *     .back()
 *   .back()
 *   .build();
 * ```
 */
export class FileSystemBuilder {
  private mockSystem: MockSystemInterface;
  private currentPath: string;
  private pathStack: string[] = [];

  constructor(rootPath: string = '/mock/system/root') {
    this.mockSystem = new MockSystemInterface(rootPath);
    this.currentPath = rootPath;
  }

  /**
   * Set the root path for the file system
   */
  root(path: string): this {
    this.mockSystem = new MockSystemInterface(path);
    this.currentPath = path;
    this.pathStack = [];
    return this;
  }

  /**
   * Add a file at the current path
   */
  file(name: string, content: string): this {
    const filePath = `${this.currentPath}/${name}`;
    this.mockSystem.addMockFile(filePath, content);
    return this;
  }

  /**
   * Enter a directory (creates it if it doesn't exist)
   */
  dir(name: string): this {
    this.pathStack.push(this.currentPath);
    this.currentPath = `${this.currentPath}/${name}`;
    this.mockSystem.addMockDirectory(this.currentPath);
    return this;
  }

  /**
   * Go back to the parent directory
   */
  back(): this {
    if (this.pathStack.length > 0) {
      this.currentPath = this.pathStack.pop()!;
    }
    return this;
  }

  /**
   * Go back to the root directory
   */
  toRoot(): this {
    this.currentPath = this.mockSystem.getCurrentFilePath();
    this.pathStack = [];
    return this;
  }

  /**
   * Add multiple files at once
   */
  files(files: Record<string, string>): this {
    for (const [name, content] of Object.entries(files)) {
      this.file(name, content);
    }
    return this;
  }

  /**
   * Add a directory with files in one step
   */
  dirWithFiles(name: string, files: Record<string, string>): this {
    return this.dir(name).files(files).back();
  }

  /**
   * Add a standard workflow structure
   */
  withWorkflow(name: string, options: WorkflowOptions = {}): this {
    const workflowYml = options.workflowYml || `workflow:\n  name: "${name}"`;
    
    this.dir('workflows')
      .dir(name)
        .file('workflow.yml', workflowYml);

    if (options.templates) {
      this.dir('templates');
      for (const [templateName, templateContent] of Object.entries(options.templates)) {
        this.dir(templateName)
          .file('default.md', templateContent)
          .back();
      }
      this.back(); // exit templates
    }

    if (options.customFiles) {
      this.files(options.customFiles);
    }

    return this.back() // exit workflow name
      .back(); // exit workflows
  }

  /**
   * Add a standard project structure
   */
  withProjectStructure(projectPath: string = '/mock/project', config?: string): this {
    const configContent = config || `user:\n  name: "Test User"`;
    
    // Save current state
    const savedPath = this.currentPath;
    const savedStack = [...this.pathStack];
    
    // Create project structure at the specified path
    this.mockSystem.addMockDirectory(projectPath);
    this.mockSystem.addMockDirectory(`${projectPath}/.markdown-workflow`);
    this.mockSystem.addMockDirectory(`${projectPath}/.markdown-workflow/workflows`);
    this.mockSystem.addMockDirectory(`${projectPath}/.markdown-workflow/collections`);
    this.mockSystem.addMockFile(`${projectPath}/.markdown-workflow/config.yml`, configContent);
    
    // Restore state
    this.currentPath = savedPath;
    this.pathStack = savedStack;
    
    return this;
  }

  /**
   * Add a system structure with package.json
   */
  withSystemStructure(packageJson?: object): this {
    const pkg = packageJson || { name: 'markdown-workflow' };
    return this.file('package.json', JSON.stringify(pkg, null, 2));
  }

  /**
   * Build and return the MockSystemInterface
   */
  build(): MockSystemInterface {
    return this.mockSystem;
  }

  /**
   * Get the current path (for debugging)
   */
  getCurrentPath(): string {
    return this.currentPath;
  }
}

export interface WorkflowOptions {
  workflowYml?: string;
  templates?: Record<string, string>;
  customFiles?: Record<string, string>;
}

/**
 * Quick helper to create a builder with common defaults
 */
export function createFileSystemBuilder(rootPath?: string): FileSystemBuilder {
  return new FileSystemBuilder(rootPath);
}

/**
 * Create a complete mock system with workflows and project structure
 */
export function createCompleteTestSystem(): MockSystemInterface {
  return new FileSystemBuilder('/mock/system/root')
    .withSystemStructure()
    .withWorkflow('job', {
      templates: {
        resume: '# Resume: {{user.name}} at {{company}}',
        cover_letter: '# Cover Letter: {{user.name}} applying to {{company}} for {{role}}'
      }
    })
    .withWorkflow('blog', {
      templates: {
        post: '# Blog Post: {{title}}'
      }
    })
    .build();
}