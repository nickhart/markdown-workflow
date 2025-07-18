import { MockSystemInterface } from '../mocks/MockSystemInterface.js';

export type FileSystemContent = {
  name: string;
  dirs: FileSystemContent[];
  files: Record<string, string>; // filename -> content
};

/**
 * Populate a MockSystemInterface with a structured filesystem layout
 */
export function populateFileSystem(
  mockSystem: MockSystemInterface,
  content: FileSystemContent,
  basePath: string = ''
): void {
  const currentPath = basePath ? `${basePath}/${content.name}` : `/${content.name}`;
  
  // Add the current directory
  mockSystem.addMockDirectory(currentPath);
  
  // Add all files in this directory
  Object.entries(content.files).forEach(([filename, fileContent]) => {
    mockSystem.addMockFile(`${currentPath}/${filename}`, fileContent);
  });
  
  // Recursively add subdirectories
  content.dirs.forEach(subDir => {
    populateFileSystem(mockSystem, subDir, currentPath);
  });
}

/**
 * Create a simple MockSystemInterface with common test filesystem layout
 */
export function createMockFileSystem(customContent?: Partial<FileSystemContent>): MockSystemInterface {
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
                      'default.md': '# Resume: {{user.name}} at {{company}}'
                    }
                  },
                  {
                    name: 'cover_letter',
                    dirs: [],
                    files: {
                      'default.md': '# Cover Letter: {{user.name}} applying to {{company}} for {{role}}'
                    }
                  }
                ],
                files: {}
              }
            ],
            files: {
              'workflow.yml': createJobWorkflowYAML()
            }
          },
          {
            name: 'blog',
            dirs: [],
            files: {
              'workflow.yml': createBlogWorkflowYAML()
            }
          }
        ],
        files: {}
      }
    ],
    files: {
      'package.json': JSON.stringify({ name: 'markdown-workflow' })
    }
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
              { name: 'collections', dirs: [], files: {} }
            ],
            files: {
              'config.yml': createDefaultConfigYAML()
            }
          }
        ],
        files: {}
      };
    } else {
      // This is an intermediate directory
      return {
        name: currentPart,
        dirs: [buildStructure(parts, index + 1)],
        files: {}
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