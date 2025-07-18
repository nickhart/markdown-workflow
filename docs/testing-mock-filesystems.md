# Mock File System Testing Guide

This guide demonstrates various approaches to creating mock file systems for testing, from simple to advanced.

## Table of Contents

1. [Path-Based Approach](#path-based-approach) - Simple and concise
2. [Fluent Builder Pattern](#fluent-builder-pattern) - Readable and chainable
3. [Fixture Files](#fixture-files) - Real files with syntax highlighting
4. [CLI Generator](#cli-generator) - Generate from actual directories
5. [Tarball Approach](#tarball-approach) - Compressed test fixtures
6. [Best Practices](#best-practices) - When to use each approach

## Path-Based Approach

The most concise way to create mock file systems. Perfect for simple test scenarios.

```typescript
import { createFileSystemFromPaths } from '../helpers/FileSystemHelpers.js';

// Simple and readable
const mockFs = createFileSystemFromPaths({
  '/system/package.json': JSON.stringify({ name: 'markdown-workflow' }),
  '/system/workflows/job/workflow.yml': 'workflow:\n  name: job',
  '/system/workflows/job/templates/resume/default.md': '# Resume: {{user.name}}',
  '/system/workflows/job/templates/cover_letter/default.md': '# Cover Letter',
});
```

**Pros:**
- Very concise and readable
- Easy to copy/paste from `tree` command output
- Natural sorting and organization
- No nested object syntax

**Cons:**
- Can become unwieldy with many files
- No structure validation
- Harder to see directory hierarchy

## Fluent Builder Pattern

Chainable API that makes complex structures more readable.

```typescript
import { FileSystemBuilder } from '../helpers/FileSystemBuilder.js';

const mockFs = new FileSystemBuilder()
  .root('/mock/system')
  .withSystemStructure() // Adds package.json
  .withWorkflow('job', {
    templates: {
      resume: '# Resume: {{user.name}} at {{company}}',
      cover_letter: '# Cover Letter: {{user.name}} for {{role}}'
    }
  })
  .withWorkflow('blog', {
    templates: {
      post: '# Blog Post: {{title}}'
    }
  })
  .build();

// Or manual construction
const mockFs2 = new FileSystemBuilder('/mock/system')
  .file('package.json', JSON.stringify({ name: 'test' }))
  .dir('workflows')
    .dir('job')
      .file('workflow.yml', 'workflow: job')
      .dir('templates')
        .file('resume.md', '# Resume')
      .back()
    .back()
  .back()
  .build();
```

**Pros:**
- Very readable and intuitive
- Type-safe with IntelliSense
- Built-in shortcuts for common patterns
- Clear directory navigation

**Cons:**
- More verbose than path-based approach
- Requires understanding of builder pattern
- Stack management with `.back()`

## Fixture Files

Store actual files in a fixtures directory for complex or reusable test data.

```typescript
import { loadFileSystemFromFixtures } from '../helpers/FileSystemHelpers.js';

// Load from tests/fixtures/example-workflow/
const mockFs = loadFileSystemFromFixtures('example-workflow');

// Or with custom root path
const mockFs2 = loadFileSystemFromFixtures('example-workflow', '/custom/root');
```

**Directory Structure:**
```
tests/fixtures/example-workflow/
├── package.json
├── workflows/
│   └── job/
│       ├── workflow.yml
│       └── templates/
│           └── resume/
│               └── default.md
└── README.md
```

**Pros:**
- Real files with proper syntax highlighting
- Easy to edit and maintain
- Can be version controlled
- Reusable across tests
- Supports any file type

**Cons:**
- More setup required
- Files scattered in different locations
- Harder to see all test data at once

## CLI Generator

Generate mock file systems from actual directories.

```bash
# Generate from a real directory
npm run generate-mock-fs ./test-fixtures ./tests/fixtures/generated.ts

# With options
npm run generate-mock-fs ./workflows ./tests/fixtures/workflows.ts \
  --export-name workflowsData \
  --exclude "*.log" \
  --exclude "node_modules" \
  --max-depth 5
```

This generates:
```typescript
// Auto-generated mock file system data
import { FileSystemPaths } from '../helpers/FileSystemHelpers.js';

export const workflowsData: FileSystemPaths = {
  '/package.json': `{"name": "markdown-workflow"}`,
  '/workflows/job/workflow.yml': `workflow:\n  name: job`,
  '/workflows/job/templates/resume/default.md': `# Resume Template`
};

// Usage:
const mockFs = createFileSystemFromPaths(workflowsData);
```

**Pros:**
- Automatically extracts from real directories
- Handles complex structures effortlessly
- Configurable exclusions and depth
- Perfect for staging test data

**Cons:**
- Requires CLI tool
- Generated files need to be committed
- May include unwanted files

## Tarball Approach

Store compressed test fixtures as tarball files.

```typescript
import { createFileSystemFromTarball } from '../helpers/FileSystemHelpers.js';

// Load from a compressed tarball
const mockFs = await createFileSystemFromTarball('./tests/fixtures/system.tar.gz');
```

**Creating tarballs:**
```bash
# Create a tarball of test fixtures
tar -czf tests/fixtures/system.tar.gz -C test-fixtures .

# Or with npm script
npm run create-fixture-tarball test-fixtures system.tar.gz
```

**Pros:**
- Very compact storage
- Can include binary files
- Versioned test data
- Easy to distribute

**Cons:**
- Requires decompression
- Harder to inspect/modify
- Binary format in version control
- More complex implementation

## Best Practices

### When to Use Each Approach

| Approach | Best For | Complexity | Maintenance |
|----------|----------|------------|-------------|
| **Path-Based** | Simple tests, few files | Low | Easy |
| **Builder Pattern** | Complex structures, reusable setup | Medium | Medium |
| **Fixture Files** | Real file validation, syntax highlighting | Medium | Easy |
| **CLI Generator** | Large existing directories | Low | Easy |
| **Tarballs** | Binary files, distribution | High | Hard |

### Recommended Patterns

1. **Start with Path-Based** for simple tests
2. **Use Builder Pattern** for complex, reusable setups
3. **Use Fixture Files** when you need real file editing
4. **Use CLI Generator** when migrating from existing directories
5. **Use Tarballs** for binary files or distribution

### Example Test Structure

```typescript
describe('MyComponent', () => {
  describe('simple cases', () => {
    it('should handle basic workflow', () => {
      // Path-based for simple, focused tests
      const mockFs = createFileSystemFromPaths({
        '/system/package.json': JSON.stringify({ name: 'test' }),
        '/system/workflows/job/workflow.yml': 'workflow: job'
      });
      
      // ... test code
    });
  });

  describe('complex workflows', () => {
    let mockFs: MockSystemInterface;
    
    beforeEach(() => {
      // Builder pattern for complex, reusable setup
      mockFs = new FileSystemBuilder()
        .withSystemStructure()
        .withWorkflow('job', { templates: { resume: '# Resume' } })
        .withWorkflow('blog', { templates: { post: '# Post' } })
        .build();
    });
    
    it('should handle multiple workflows', () => {
      // ... test code
    });
  });

  describe('real workflow files', () => {
    it('should validate actual templates', () => {
      // Fixture files for real file validation
      const mockFs = loadFileSystemFromFixtures('example-workflow');
      
      // ... test code
    });
  });
});
```

## Migration Guide

### From Old Nested Structure

**Before:**
```typescript
const mockSystem = new MockSystemInterface('/system');
const content: FileSystemContent = {
  name: 'system',
  dirs: [
    {
      name: 'workflows',
      dirs: [
        {
          name: 'job',
          dirs: [],
          files: { 'workflow.yml': 'workflow: job' }
        }
      ],
      files: {}
    }
  ],
  files: { 'package.json': '{"name": "test"}' }
};
populateFileSystem(mockSystem, content);
```

**After (Path-Based):**
```typescript
const mockSystem = createFileSystemFromPaths({
  '/system/package.json': '{"name": "test"}',
  '/system/workflows/job/workflow.yml': 'workflow: job'
});
```

**After (Builder Pattern):**
```typescript
const mockSystem = new FileSystemBuilder('/system')
  .file('package.json', '{"name": "test"}')
  .dir('workflows')
    .dir('job')
      .file('workflow.yml', 'workflow: job')
    .back()
  .back()
  .build();
```

### Performance Considerations

- **Path-Based**: Fastest for simple structures
- **Builder Pattern**: Slight overhead but more readable
- **Fixture Files**: I/O overhead, consider caching
- **CLI Generator**: Build-time cost, runtime efficient
- **Tarballs**: Decompression overhead, consider async loading

### Testing the Mock System Tools

```typescript
// Test the path-based approach
describe('createFileSystemFromPaths', () => {
  it('should create correct file structure', () => {
    const mockFs = createFileSystemFromPaths({
      '/test/file.txt': 'content',
      '/test/subdir/other.txt': 'other content'
    });
    
    expect(mockFs.existsSync('/test/file.txt')).toBe(true);
    expect(mockFs.existsSync('/test/subdir')).toBe(true);
    expect(mockFs.readFileSync('/test/file.txt')).toBe('content');
  });
});

// Test the builder pattern
describe('FileSystemBuilder', () => {
  it('should build correct structure', () => {
    const mockFs = new FileSystemBuilder('/test')
      .file('config.json', '{}')
      .dir('data')
        .file('data.txt', 'test data')
      .back()
      .build();
    
    expect(mockFs.existsSync('/test/config.json')).toBe(true);
    expect(mockFs.existsSync('/test/data/data.txt')).toBe(true);
  });
});
```