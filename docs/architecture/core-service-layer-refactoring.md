# Core Service Layer Refactoring: CLI to Multi-Interface Architecture

**Status**: Proposed  
**Date**: 2025-01-26  
**Author**: Architecture Planning Session  
**Priority**: High

## Executive Summary

This document outlines a comprehensive refactoring plan to extract business logic from CLI commands into reusable service classes, enabling the creation of web interfaces and other client types while maintaining the existing CLI functionality.

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Identified Problems](#identified-problems)
3. [Proposed Solution](#proposed-solution)
4. [Implementation Plan](#implementation-plan)
5. [Code Examples](#code-examples)
6. [Migration Strategy](#migration-strategy)
7. [Testing Approach](#testing-approach)
8. [Future Considerations](#future-considerations)

## Current Architecture Analysis

### Current File Structure

```
src/
├── cli/
│   ├── commands/           # Business logic embedded here
│   │   ├── create.ts       # 314 lines, heavy business logic
│   │   ├── status.ts       # 115 lines, workflow validation
│   │   ├── format.ts       # 127 lines, document processing
│   │   ├── list.ts         # 115 lines, collection querying
│   │   └── ...
│   ├── shared/            # CLI-specific utilities
│   └── index.ts           # Command registration
├── core/
│   ├── workflow-engine.ts  # Some business logic, but limited
│   ├── config-discovery.ts # Configuration management
│   └── system-interface.ts # Basic file system abstraction
└── shared/                # Pure utilities
    ├── date-utils.ts
    ├── file-utils.ts
    └── web-scraper.ts
```

### Current Logic Distribution

| Component        | Responsibilities                                                                                  | Lines | Issues                       |
| ---------------- | ------------------------------------------------------------------------------------------------- | ----- | ---------------------------- |
| `create.ts`      | Collection creation, template processing, directory management, URL scraping, metadata generation | 314   | ❌ Mixed concerns            |
| `status.ts`      | Status validation, workflow loading, collection updates, transition rules                         | 115   | ❌ Business logic in CLI     |
| `format.ts`      | Document conversion, artifact discovery, batch processing                                         | 127   | ❌ Output coupled to console |
| `WorkflowEngine` | Some workflow operations, collection management                                                   | 400+  | ⚠️ Incomplete abstraction    |

## Identified Problems

### 1. Business Logic Coupling

- **CLI-first design**: Core operations embedded in CLI command handlers
- **Console output coupling**: Direct `console.log` calls prevent reuse
- **File system coupling**: Direct `fs` calls limit testing and web adaptation

### 2. Code Duplication

- **Workflow loading**: Repeated in multiple commands
- **Project initialization**: Similar patterns across commands
- **Error handling**: Recently standardized but still CLI-specific

### 3. Limited Extensibility

- **Web interface impossible**: Business logic tied to CLI patterns
- **Testing difficulties**: Hard to unit test without CLI context
- **Output format rigidity**: Cannot easily change output format

### 4. Architecture Inconsistencies

- Some logic in `WorkflowEngine`, some in CLI commands
- No clear separation of concerns
- Mixed abstraction levels

## Proposed Solution

### Core Principles

1. **Separation of Concerns**: Business logic, I/O operations, and interface concerns are separate
2. **Interface Agnostic**: Core services work with any interface (CLI, Web, API)
3. **Dependency Injection**: Services accept abstractions, not concrete implementations
4. **Structured Output**: Operations return structured data, not void with side effects

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Layer                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│   CLI Commands  │   Web API       │   Future Interfaces     │
│   - Arg parsing │   - HTTP routes │   - Desktop app         │
│   - CLI output  │   - JSON resp   │   - Mobile app          │
└─────────────────┴─────────────────┴─────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Service Layer (New)                        │
├─────────────────┬─────────────────┬─────────────────────────┤
│CollectionService│ TemplateService │  WorkflowService        │
│- Create/Update  │- Process/Render │  - Load/Validate        │
│- List/Filter    │- Resolve paths  │  - Stage management     │
│- Status mgmt    │- Variable subst │  - Schema validation    │
└─────────────────┴─────────────────┴─────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Provider Layer                             │
├─────────────────┬─────────────────┬─────────────────────────┤
│FileSystemProvider│  OutputProvider │   Other Providers       │
│- NodeFS (CLI)   │  - CLI logging  │   - Config provider     │
│- VirtualFS(Web) │  - JSON output  │   - Cache provider      │
│- TestFS (Tests) │  - Structured   │   - Auth provider       │
└─────────────────┴─────────────────┴─────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Core Layer                               │
├─────────────────┬─────────────────┬─────────────────────────┤
│  WorkflowEngine │  ConfigDiscovery│     Shared Utils        │
│  (Enhanced)     │  (Existing)     │     (Existing)          │
└─────────────────┴─────────────────┴─────────────────────────┘
```

## Implementation Plan

### Phase 1: Provider Abstractions (Week 1)

#### 1.1 Output Provider Interface

```typescript
interface OutputProvider {
  logInfo(message: string): void;
  logSuccess(message: string): void;
  logError(message: string): void;
  logWarning(message: string): void;
  logProgress(message: string, current: number, total: number): void;
}

interface StructuredOutputProvider extends OutputProvider {
  getMessages(): OutputMessage[];
  clearMessages(): void;
  toJSON(): OutputSummary;
}
```

#### 1.2 Enhanced File System Provider

```typescript
interface FileSystemProvider extends SystemInterface {
  // Virtual file support for web interfaces
  createVirtualDirectory(path: string): void;
  writeVirtualFile(path: string, content: string): void;
  readVirtualFile(path: string): string;

  // Export capabilities for web
  exportAsZip(): Promise<Buffer>;
  exportAsJSON(): VirtualFileTree;

  // Batch operations
  copyDirectory(src: string, dest: string): void;
  deleteDirectory(path: string): void;
}
```

### Phase 2: Core Service Classes (Week 2-3)

#### 2.1 Collection Service

Extract all collection-related operations from CLI commands:

```typescript
class CollectionService {
  constructor(
    private fs: FileSystemProvider,
    private output: OutputProvider,
    private workflowEngine: WorkflowEngine,
  ) {}

  async createCollection(
    workflowName: string,
    params: CreateCollectionParams,
  ): Promise<CreateCollectionResult> {
    // All logic from create.ts goes here
    // Returns structured result instead of void
  }

  async updateCollectionStatus(
    workflowName: string,
    collectionId: string,
    newStatus: string,
  ): Promise<StatusUpdateResult> {
    // All logic from status.ts goes here
  }

  async listCollections(
    workflowName: string,
    filters?: CollectionFilters,
  ): Promise<CollectionSummary[]> {
    // All logic from list.ts goes here
  }

  async formatCollection(
    workflowName: string,
    collectionId: string,
    options: FormatOptions,
  ): Promise<FormatResult> {
    // All logic from format.ts goes here
  }
}
```

#### 2.2 Template Service

Handle all template processing:

```typescript
class TemplateService {
  constructor(
    private fs: FileSystemProvider,
    private output: OutputProvider,
  ) {}

  async processTemplate(
    template: WorkflowTemplate,
    variables: TemplateVariables,
    outputPath: string,
  ): Promise<ProcessedTemplate> {
    // Template processing logic from create.ts
  }

  async resolveTemplatePath(
    template: WorkflowTemplate,
    workflowName: string,
    variant?: string,
  ): Promise<string | null> {
    // Template resolution logic
  }

  async addItemFromTemplate(
    template: WorkflowTemplate,
    collectionPath: string,
    variables: TemplateVariables,
  ): Promise<AddItemResult> {
    // Logic from add.ts
  }
}
```

#### 2.3 Workflow Service

Manage workflow definitions and validation:

```typescript
class WorkflowService {
  constructor(
    private fs: FileSystemProvider,
    private output: OutputProvider,
  ) {}

  async getAvailableWorkflows(): Promise<WorkflowSummary[]> {
    // Logic from available.ts
  }

  async loadWorkflow(workflowName: string): Promise<WorkflowFile> {
    // Enhanced workflow loading
  }

  async validateWorkflowTransition(
    workflow: WorkflowFile,
    fromStatus: string,
    toStatus: string,
  ): Promise<ValidationResult> {
    // Status transition validation
  }
}
```

### Phase 3: CLI Refactoring (Week 4)

Transform CLI commands into thin wrappers:

```typescript
// Before: create.ts (314 lines)
export async function createCommand(
  workflowName: string,
  company: string,
  role: string,
  options: CreateOptions = {},
): Promise<void> {
  // 300+ lines of business logic
}

// After: create.ts (~30 lines)
export async function createCommand(
  workflowName: string,
  company: string,
  role: string,
  options: CreateOptions = {},
): Promise<void> {
  const services = ServiceFactory.createForCli(options);

  try {
    const result = await services.collections.createCollection(workflowName, {
      company,
      role,
      url: options.url,
      templateVariant: options.template_variant,
      force: options.force,
    });

    if (result.success) {
      services.output.logSuccess(`Collection created: ${result.collectionId}`);
      services.output.logInfo(`Location: ${result.collectionPath}`);

      // Show next steps
      showNextSteps(services.output, workflowName, result.collectionId);
    }
  } catch (error) {
    throw error; // Let error handler deal with it
  }
}
```

### Phase 4: Web Interface (Week 5-6)

#### 4.1 API Endpoints

```typescript
// app/api/workflows/[workflow]/collections/route.ts
export async function POST(request: Request, { params }: { params: { workflow: string } }) {
  try {
    const body = await request.json();
    const services = ServiceFactory.createForWeb();

    const result = await services.collections.createCollection(params.workflow, body);

    return Response.json({
      success: result.success,
      collectionId: result.collectionId,
      files: services.fs.exportAsJSON(),
      messages: services.output.getMessages(),
      downloadUrl: result.success ? `/api/download/${result.collectionId}` : null,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 400 });
  }
}
```

#### 4.2 File Export Endpoints

```typescript
// app/api/download/[collectionId]/route.ts
export async function GET(request: Request, { params }: { params: { collectionId: string } }) {
  const services = ServiceFactory.createForWeb();
  const zipBuffer = await services.fs.exportAsZip();

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${params.collectionId}.zip"`,
    },
  });
}
```

## Code Examples

### Service Factory Pattern

```typescript
class ServiceFactory {
  static createForCli(options: CliOptions = {}) {
    const output = new CliOutputProvider();
    const fs = new NodeFileSystemProvider();
    const workflowEngine = new WorkflowEngine(options.cwd, undefined, fs);

    return {
      collections: new CollectionService(fs, output, workflowEngine),
      templates: new TemplateService(fs, output),
      workflows: new WorkflowService(fs, output),
      output,
      fs,
    };
  }

  static createForWeb(options: WebOptions = {}) {
    const output = new StructuredOutputProvider();
    const fs = new VirtualFileSystemProvider();
    const workflowEngine = new WorkflowEngine(options.projectRoot, undefined, fs);

    return {
      collections: new CollectionService(fs, output, workflowEngine),
      templates: new TemplateService(fs, output),
      workflows: new WorkflowService(fs, output),
      output,
      fs,
    };
  }

  static createForTesting(options: TestOptions = {}) {
    const output = new MockOutputProvider();
    const fs = new MockFileSystemProvider(options.mockFileSystem);
    const workflowEngine = new WorkflowEngine('.', undefined, fs);

    return {
      collections: new CollectionService(fs, output, workflowEngine),
      templates: new TemplateService(fs, output),
      workflows: new WorkflowService(fs, output),
      output,
      fs,
    };
  }
}
```

### Output Provider Implementations

```typescript
class CliOutputProvider implements OutputProvider {
  logInfo(message: string): void {
    console.log(`ℹ️ ${message}`);
  }

  logSuccess(message: string): void {
    console.log(`✅ ${message}`);
  }

  logError(message: string): void {
    console.error(`❌ ${message}`);
  }

  logWarning(message: string): void {
    console.warn(`⚠️ ${message}`);
  }

  logProgress(message: string, current: number, total: number): void {
    console.log(`📊 ${message} (${current}/${total})`);
  }
}

class StructuredOutputProvider implements StructuredOutputProvider {
  private messages: OutputMessage[] = [];

  logInfo(message: string): void {
    this.messages.push({ level: 'info', message, timestamp: new Date() });
  }

  logSuccess(message: string): void {
    this.messages.push({ level: 'success', message, timestamp: new Date() });
  }

  logError(message: string): void {
    this.messages.push({ level: 'error', message, timestamp: new Date() });
  }

  logWarning(message: string): void {
    this.messages.push({ level: 'warning', message, timestamp: new Date() });
  }

  logProgress(message: string, current: number, total: number): void {
    this.messages.push({
      level: 'progress',
      message,
      metadata: { current, total },
      timestamp: new Date(),
    });
  }

  getMessages(): OutputMessage[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }

  toJSON(): OutputSummary {
    return {
      messages: this.messages,
      summary: {
        total: this.messages.length,
        errors: this.messages.filter((m) => m.level === 'error').length,
        warnings: this.messages.filter((m) => m.level === 'warning').length,
      },
    };
  }
}
```

### Virtual File System

```typescript
class VirtualFileSystemProvider implements FileSystemProvider {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  writeVirtualFile(path: string, content: string): void {
    this.files.set(path, content);
    // Ensure parent directories exist
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) this.directories.add(dir);
  }

  readVirtualFile(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async exportAsZip(): Promise<Buffer> {
    const JSZip = await import('jszip');
    const zip = new JSZip.default();

    for (const [path, content] of this.files) {
      zip.file(path, content);
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  exportAsJSON(): VirtualFileTree {
    return {
      files: Object.fromEntries(this.files),
      directories: Array.from(this.directories),
      metadata: {
        fileCount: this.files.size,
        totalSize: Array.from(this.files.values()).reduce(
          (sum, content) => sum + content.length,
          0,
        ),
      },
    };
  }

  // Implement all SystemInterface methods...
}
```

## Migration Strategy

### Backward Compatibility

1. **Existing CLI preserved**: All current commands work identically
2. **Gradual migration**: Commands migrated one at a time
3. **Test coverage**: Comprehensive tests ensure no regressions
4. **Feature flags**: Enable new architecture incrementally

### Migration Steps

```typescript
// Step 1: Extract service, keep old command
export async function createCommand(...args) {
  if (process.env.USE_NEW_ARCHITECTURE) {
    return createCommandNew(...args);
  }
  return createCommandLegacy(...args);
}

// Step 2: Test new implementation
// Step 3: Switch default, keep legacy as fallback
// Step 4: Remove legacy implementation
```

### Data Migration

- No data migration needed (file system format unchanged)
- Configuration files remain compatible
- Workflow definitions unchanged

## Testing Approach

### Service Layer Testing

```typescript
describe('CollectionService', () => {
  let service: CollectionService;
  let mockFs: MockFileSystemProvider;
  let mockOutput: MockOutputProvider;

  beforeEach(() => {
    const services = ServiceFactory.createForTesting({
      mockFileSystem: createMockProjectStructure(),
    });
    service = services.collections;
    mockFs = services.fs as MockFileSystemProvider;
    mockOutput = services.output as MockOutputProvider;
  });

  it('should create collection with proper file structure', async () => {
    const result = await service.createCollection('job', {
      company: 'TestCorp',
      role: 'Engineer',
    });

    expect(result.success).toBe(true);
    expect(mockFs.exists(result.collectionPath)).toBe(true);
    expect(mockFs.readFile(`${result.collectionPath}/collection.yml`)).toContain('TestCorp');
    expect(mockOutput.getMessages()).toHaveLength(3); // Creation messages
  });
});
```

### Integration Testing

```typescript
describe('CLI Integration', () => {
  it('should maintain identical behavior', async () => {
    // Test that new architecture produces identical results to old
    const oldResult = await runLegacyCommand('create', 'job', 'TestCorp', 'Engineer');
    const newResult = await runNewCommand('create', 'job', 'TestCorp', 'Engineer');

    expect(normalizeOutput(newResult)).toEqual(normalizeOutput(oldResult));
  });
});
```

## Future Considerations

### Extensibility Points

1. **Provider System**: Easy to add new file systems, output formats
2. **Service Composition**: Services can be combined for complex operations
3. **Plugin Architecture**: Workflow actions could become plugins
4. **Caching Layer**: Add caching provider for performance

### Web Interface Features

1. **Real-time Collaboration**: Multiple users editing collections
2. **Version Control**: Git integration through web interface
3. **Template Marketplace**: Share custom templates
4. **Workflow Designer**: Visual workflow creation
5. **Analytics Dashboard**: Usage statistics and insights

### Performance Optimizations

1. **Lazy Loading**: Load workflows and templates on demand
2. **Background Processing**: Long operations run asynchronously
3. **Incremental Updates**: Only process changed files
4. **Compression**: Optimize file transfers

### Security Considerations

1. **Input Validation**: Sanitize all user inputs
2. **File System Isolation**: Prevent path traversal attacks
3. **Authentication**: User management for web interface
4. **Rate Limiting**: Prevent abuse of API endpoints

## Conclusion

This refactoring will transform the markdown-workflow system from a CLI-centric tool into a flexible, multi-interface platform. The service layer abstraction enables:

- **Web interface development** without duplicating business logic
- **Improved testability** through dependency injection
- **Better maintainability** with clear separation of concerns
- **Future extensibility** for desktop apps, mobile apps, or other interfaces

The migration can be done incrementally with zero disruption to existing users, while opening up new possibilities for the platform's evolution.

---

**Next Steps**: Review this document, provide feedback, and approve the implementation plan. Development can begin immediately upon approval.
