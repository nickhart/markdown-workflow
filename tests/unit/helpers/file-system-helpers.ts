import { MockSystemInterface } from '../mocks/mock-system-interface';
import { crawlDirectoryStructure } from '../../../scripts/generate-mock-fs';
import * as path from 'path';

export type FileSystemContent = {
  name: string;
  dirs: FileSystemContent[];
  files: Record<string, string>; // filename -> content
};

export type FileSystemPaths = Record<string, string>; // path -> content

/**
 * Populate a MockSystemInterface with a structured filesystem layout
 */
export function populateFileSystem(
  mockSystem: MockSystemInterface,
  content: FileSystemContent,
  basePath: string = '',
): void {
  const currentPath = basePath ? `${basePath}/${content.name}` : `/${content.name}`;

  // Add the current directory
  mockSystem.addMockDirectory(currentPath);

  // Add all files in this directory
  Object.entries(content.files).forEach(([filename, fileContent]) => {
    mockSystem.addMockFile(`${currentPath}/${filename}`, fileContent);
  });

  // Recursively add subdirectories
  content.dirs.forEach((subDir) => {
    populateFileSystem(mockSystem, subDir, currentPath);
  });
}

/**
 * Create a simple MockSystemInterface with common test filesystem layout
 */
export function createMockFileSystem(
  customContent?: Partial<FileSystemContent>,
): MockSystemInterface {
  const mockSystem = new MockSystemInterface('/mock/system/root');

  const defaultContent: FileSystemContent = {
    name: 'mock/system/root',
    dirs: [
      {
        name: 'workflows',
        dirs: [
          {
            name: 'job',
            dirs: [
              {
                name: 'templates',
                dirs: [
                  {
                    name: 'resume',
                    dirs: [],
                    files: {
                      'default.md': '# Resume: {{user.name}} at {{company}}',
                    },
                  },
                  {
                    name: 'cover_letter',
                    dirs: [],
                    files: {
                      'default.md':
                        '# Cover Letter: {{user.name}} applying to {{company}} for {{role}}',
                    },
                  },
                ],
                files: {},
              },
            ],
            files: {
              'workflow.yml': createJobWorkflowYAML(),
            },
          },
          {
            name: 'blog',
            dirs: [],
            files: {
              'workflow.yml': createBlogWorkflowYAML(),
            },
          },
        ],
        files: {},
      },
    ],
    files: {
      'package.json': JSON.stringify({ name: 'markdown-workflow' }),
    },
  };

  // Merge custom content if provided
  const finalContent = customContent ? { ...defaultContent, ...customContent } : defaultContent;

  // Populate filesystem starting from root
  populateFileSystem(mockSystem, finalContent);

  return mockSystem;
}

/**
 * Create a project filesystem layout with marker directory
 */
export function createProjectFileSystem(projectPath: string = '/mock/project'): FileSystemContent {
  // Remove leading slash and split path into parts
  const pathParts = projectPath.replace(/^\//, '').split('/');

  // Build nested structure from the path parts
  const buildStructure = (parts: string[], index: number = 0): FileSystemContent => {
    const currentPart = parts[index];
    const isLast = index === parts.length - 1;

    if (isLast) {
      // This is the project directory - add the .markdown-workflow structure
      return {
        name: currentPart,
        dirs: [
          {
            name: '.markdown-workflow',
            dirs: [
              { name: 'workflows', dirs: [], files: {} },
              { name: 'collections', dirs: [], files: {} },
            ],
            files: {
              'config.yml': createDefaultConfigYAML(),
            },
          },
        ],
        files: {},
      };
    } else {
      // This is an intermediate directory
      return {
        name: currentPart,
        dirs: [buildStructure(parts, index + 1)],
        files: {},
      };
    }
  };

  return buildStructure(pathParts);
}

function createJobWorkflowYAML(): string {
  return `workflow:
  name: "job"
  description: "Job application workflow"
  version: "1.0.0"
  stages:
    - name: "active"
      description: "Active applications"
      color: "blue"
      next: ["submitted", "rejected"]
    - name: "submitted"
      description: "Submitted applications"
      color: "yellow"
      next: ["interview", "rejected"]
    - name: "interview"
      description: "Interview scheduled"
      color: "orange"
      next: ["offered", "rejected"]
    - name: "offered"
      description: "Job offers received"
      color: "green"
      next: ["accepted", "declined"]
    - name: "rejected"
      description: "Rejected applications"
      color: "red"
      terminal: true
  templates:
    - name: "resume"
      file: "templates/resume/default.md"
      output: "resume_{{user.preferred_name}}.md"
      description: "Resume template"
    - name: "cover_letter"
      file: "templates/cover_letter/default.md"
      output: "cover_letter_{{user.preferred_name}}.md"
      description: "Cover letter template"
  statics: []
  actions:
    - name: "create"
      description: "Create new collection"
      usage: "wf create job <company> <role> [--url <job_posting_url>] [--template-variant <variant>]"
      templates: ["resume", "cover_letter"]
      metadata_file: "collection.yml"
  metadata:
    required_fields: ["company", "role"]
    optional_fields: ["url", "salary", "location"]
    auto_generated: ["collection_id", "date_created", "date_modified"]
  collection_id:
    pattern: "{{company}}_{{role}}_{{date}}"
    max_length: 50`;
}

function createBlogWorkflowYAML(): string {
  return `workflow:
  name: "blog"
  description: "Blog post workflow"
  version: "1.0.0"
  stages:
    - name: "drafts"
      description: "Draft posts"
      color: "gray"
      next: ["published", "archived"]
    - name: "published"
      description: "Published posts"
      color: "green"
      next: ["archived"]
    - name: "archived"
      description: "Archived posts"
      color: "red"
      terminal: true
  templates:
    - name: "post"
      file: "templates/post/default.md"
      output: "{{title}}.md"
      description: "Blog post template"
  statics: []
  actions:
    - name: "create"
      description: "Create new post"
      usage: "wf create blog <title> <description> [--url <url>] [--template-variant <variant>]"
      templates: ["post"]
      metadata_file: "post.yml"
  metadata:
    required_fields: ["title"]
    optional_fields: ["tags", "category", "author"]
    auto_generated: ["collection_id", "date_created", "date_modified"]
  collection_id:
    pattern: "{{title}}_{{date}}"
    max_length: 50`;
}

function createDefaultConfigYAML(): string {
  return `user:
  name: "Test User"
  preferred_name: "test_user"
  email: "test@example.com"
  phone: "(555) 123-4567"
  address: "123 Test St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "linkedin.com/in/testuser"
  github: "github.com/testuser"
  website: "testuser.com"

system:
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  output_formats:
    - "docx"
    - "html"
    - "pdf"
  git:
    auto_commit: false
    commit_message_template: "Update {{workflow}} collection {{collection_id}}"
  collection_id:
    date_format: "YYYYMMDD"
    sanitize_spaces: "_"
    max_length: 50

workflows: {}`;
}

/**
 * Create a mock file system from a flat path-to-content mapping
 *
 * @example
 * ```typescript
 * const mockFs = createFileSystemFromPaths({
 *   '/system/package.json': JSON.stringify({ name: 'markdown-workflow' }),
 *   '/system/workflows/job/workflow.yml': 'workflow:\n  name: job',
 *   '/system/workflows/job/templates/resume/default.md': '# Resume Template'
 * });
 * ```
 */
export function createFileSystemFromPaths(paths: FileSystemPaths): MockSystemInterface {
  // Find the root path (shortest path that all others share)
  const pathKeys = Object.keys(paths);
  if (pathKeys.length === 0) {
    throw new Error('No paths provided');
  }

  // Find common root
  let root = pathKeys[0];
  for (const path of pathKeys.slice(1)) {
    while (!path.startsWith(root)) {
      root = root.substring(0, root.lastIndexOf('/'));
      if (root === '') {
        root = '/';
        break;
      }
    }
  }

  // The root we found is the common directory, no need to get parent
  // (The original logic was wrong - it assumed root might be a file)

  const mockSystem = new MockSystemInterface(root);

  // Sort paths to ensure directories are created before files
  const sortedPaths = pathKeys.sort();

  for (const fullPath of sortedPaths) {
    const content = paths[fullPath];

    // Create all parent directories
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (dirPath) {
      createDirectoryPath(mockSystem, dirPath);
    }

    // Add the file
    mockSystem.addMockFile(fullPath, content);
  }

  return mockSystem;
}

/**
 * Helper to create a directory path and all its parents
 */
function createDirectoryPath(mockSystem: MockSystemInterface, dirPath: string): void {
  const parts = dirPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const part of parts) {
    currentPath += '/' + part;
    if (!mockSystem.existsSync(currentPath)) {
      mockSystem.addMockDirectory(currentPath);
    }
  }
}

/**
 * Enhanced mock file system creation with multiple approaches
 */
export function createEnhancedMockFileSystem(): MockSystemInterface {
  return createFileSystemFromPaths({
    '/mock/system/package.json': JSON.stringify({ name: 'markdown-workflow' }),
    '/mock/system/workflows/job/workflow.yml': createJobWorkflowYAML(),
    '/mock/system/workflows/job/templates/resume/default.md':
      '# Resume: {{user.name}} at {{company}}',
    '/mock/system/workflows/job/templates/cover_letter/default.md':
      '# Cover Letter: {{user.name}} applying to {{company}} for {{role}}',
    '/mock/system/workflows/blog/workflow.yml': createBlogWorkflowYAML(),
  });
}

/**
 * Create a project file system using the path-based approach
 */
export function createProjectFileSystemFromPaths(
  projectPath: string = '/mock/project',
): MockSystemInterface {
  return createFileSystemFromPaths({
    [`${projectPath}/.markdown-workflow/config.yml`]: createDefaultConfigYAML(),
    [`${projectPath}/.markdown-workflow/workflows/.gitkeep`]: '',
    [`${projectPath}/.markdown-workflow/collections/.gitkeep`]: '',
  });
}

/**
 * Load a mock file system from a fixtures directory
 *
 * @param fixtureDir - Path to the fixture directory (relative to tests/fixtures)
 * @param rootPath - Root path for the mock system (defaults to the fixture directory name)
 *
 * @example
 * ```typescript
 * // Load from tests/fixtures/example-workflow/
 * const mockFs = loadFileSystemFromFixtures('example-workflow');
 *
 * // Or with custom root path
 * const mockFs = loadFileSystemFromFixtures('example-workflow', '/custom/root');
 * ```
 */
export function loadFileSystemFromFixtures(
  fixtureDir: string,
  rootPath?: string,
): MockSystemInterface {
  const fixturesPath = path.resolve(__dirname, '../fixtures');
  const fixturePath = path.join(fixturesPath, fixtureDir);

  const actualRoot = rootPath || `/${fixtureDir}`;

  try {
    const paths = crawlDirectoryStructure(fixturePath, {
      includeContent: true,
      excludePatterns: ['.DS_Store', '.git', 'node_modules'],
    });

    // Convert relative paths to absolute paths with the specified root
    const absolutePaths: Record<string, string> = {};
    for (const [relativePath, content] of Object.entries(paths)) {
      const absolutePath = path.posix.join(actualRoot, relativePath);
      absolutePaths[absolutePath] = content;
    }

    return createFileSystemFromPaths(absolutePaths);
  } catch (error) {
    throw new Error(`Failed to load fixture from ${fixturePath}: ${error}`);
  }
}

/**
 * Combine multiple file systems into one
 *
 * @example
 * ```typescript
 * const systemFs = createEnhancedMockFileSystem();
 * const projectFs = createProjectFileSystemFromPaths('/mock/project');
 * const combined = combineFileSystems(systemFs, projectFs);
 * ```
 */
export function combineFileSystems(...fileSystems: MockSystemInterface[]): MockSystemInterface {
  if (fileSystems.length === 0) {
    throw new Error('At least one file system must be provided');
  }

  const combined = fileSystems[0];

  for (let i = 1; i < fileSystems.length; i++) {
    const _fs = fileSystems[i];

    // Get all files and directories from the other file system
    // This is a simplified approach - in a real implementation, you'd need to
    // access the internal state of MockSystemInterface
    // For now, we'll just return the first file system
    console.warn('combineFileSystems: Currently only returns the first file system');
  }

  return combined;
}
