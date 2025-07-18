# Mock File System Testing Guide

This document provides comprehensive guidance on testing in the markdown-workflow project, with a focus on mock filesystem approaches and testing utilities.

## Table of Contents

1. [Overview](#overview)
2. [Mock Filesystem Approaches](#mock-filesystem-approaches)
3. [Quick Start Examples](#quick-start-examples)
4. [Testing Utilities](#testing-utilities)
5. [Best Practices](#best-practices)
6. [Advanced Usage](#advanced-usage)
7. [Migration Guide](#migration-guide)

## Overview

The markdown-workflow project uses a sophisticated testing infrastructure built around mock file systems. This allows us to test file operations, configuration discovery, and workflow processing without touching the real filesystem.

### Core Concepts

- **MockSystemInterface**: Drop-in replacement for filesystem operations
- **ConfigDiscovery**: Uses dependency injection for testable filesystem operations
- **Multiple Mock Creation Approaches**: Path-based, builder pattern, fixtures, and CLI generation

## Mock Filesystem Approaches

We provide multiple approaches for creating mock file systems, each optimized for different use cases:

### 1. Path-Based Approach (Recommended for Simple Tests)

The most concise way to create mock file systems using a flat path-to-content mapping.

```typescript
import { createFileSystemFromPaths } from '../helpers/FileSystemHelpers.js';

// Simple and readable
const mockFs = createFileSystemFromPaths({
  '/system/package.json': JSON.stringify({ name: 'markdown-workflow' }),
  '/system/workflows/job/workflow.yml': 'workflow:\n  name: job',
  '/system/workflows/job/templates/resume/default.md': '# Resume: {{user.name}}',
  '/system/workflows/job/templates/cover_letter/default.md': '# Cover Letter',
});

// Use in tests
expect(mockFs.existsSync('/system/package.json')).toBe(true);
expect(mockFs.readFileSync('/system/workflows/job/workflow.yml')).toContain('job');
```

**Pros:** Very concise, easy to read, natural path organization  
**Cons:** Can become unwieldy with many files, no structure validation

### 2. Fluent Builder Pattern (Recommended for Complex Tests)

Chainable API that makes complex file structures more readable and provides built-in shortcuts.

```typescript
import { FileSystemBuilder } from '../helpers/FileSystemBuilder.js';

const mockFs = new FileSystemBuilder()
  .root('/mock/system')
  .withSystemStructure() // Adds package.json
  .withWorkflow('job', {
    templates: {
      resume: '# Resume: {{user.name}} at {{company}}',
      cover_letter: '# Cover Letter: {{user.name}} for {{role}}',
    },
  })
  .withWorkflow('blog', {
    templates: {
      post: '# Blog Post: {{title}}',
    },
  })
  .build();

// Or manual construction
const mockFs2 = new FileSystemBuilder('/test')
  .file('config.json', '{"test": true}')
  .dir('workflows')
  .dir('job')
  .file('workflow.yml', 'name: job')
  .dir('templates')
  .file('resume.md', '# Resume')
  .back() // Exit templates dir
  .back() // Exit job dir
  .back() // Exit workflows dir
  .build();
```

**Pros:** Very readable, type-safe, built-in shortcuts, clear navigation  
**Cons:** More verbose than path-based, requires understanding builder pattern

### 3. Enhanced Helpers (Recommended for Standard Cases)

Pre-built helpers for common testing scenarios.

```typescript
import {
  createEnhancedMockFileSystem,
  createProjectFileSystemFromPaths,
  createCompleteTestSystem,
} from '../helpers/FileSystemHelpers.js';

// Complete system with job and blog workflows
const systemFs = createEnhancedMockFileSystem();

// Project structure only
const projectFs = createProjectFileSystemFromPaths('/mock/project');

// Everything - system + multiple workflows
const completeFs = createCompleteTestSystem();
```

### 4. Fixture Files (Recommended for Real File Validation)

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

**Pros:** Real files with syntax highlighting, easy to edit, reusable  
**Cons:** More setup required, files scattered in different locations

### 5. CLI Generator (Recommended for Migrating Existing Data)

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
  '/workflows/job/templates/resume/default.md': `# Resume Template`,
};

// Usage:
const mockFs = createFileSystemFromPaths(workflowsData);
```

**Pros:** Automatically extracts from real directories, handles complex structures  
**Cons:** Requires CLI tool, generated files need to be committed

## Quick Start Examples

### Basic Test Setup

```typescript
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { createFileSystemFromPaths } from '../helpers/FileSystemHelpers.js';

describe('MyComponent', () => {
  let mockSystem: MockSystemInterface;
  let configDiscovery: ConfigDiscovery;

  beforeEach(() => {
    // Create mock filesystem
    mockSystem = createFileSystemFromPaths({
      '/system/package.json': JSON.stringify({ name: 'markdown-workflow' }),
      '/system/workflows/job/workflow.yml': 'workflow:\n  name: job',
      '/project/.markdown-workflow/config.yml': 'user:\n  name: "Test User"',
    });

    // Create ConfigDiscovery with dependency injection
    configDiscovery = new ConfigDiscovery(mockSystem);
  });

  it('should discover workflows', () => {
    const workflows = configDiscovery.getAvailableWorkflows('/system');
    expect(workflows).toContain('job');
  });
});
```

### Testing File Operations

```typescript
it('should create files correctly', () => {
  const mockFs = createFileSystemFromPaths({
    '/project/.markdown-workflow/config.yml': 'user:\n  name: "Test"',
  });

  // Test file existence
  expect(mockFs.existsSync('/project/.markdown-workflow/config.yml')).toBe(true);

  // Test file content
  const content = mockFs.readFileSync('/project/.markdown-workflow/config.yml');
  expect(content).toContain('Test');

  // Test directory operations
  expect(mockFs.existsSync('/project/.markdown-workflow')).toBe(true);
});
```

### Testing Complex Workflows

```typescript
it('should handle complete workflow system', () => {
  const mockFs = new FileSystemBuilder()
    .root('/system')
    .withSystemStructure()
    .withWorkflow('job', {
      templates: {
        resume: '# Resume for {{user.name}}',
        cover_letter: '# Cover Letter for {{company}}',
      },
    })
    .withProjectStructure('/project')
    .build();

  const configDiscovery = new ConfigDiscovery(mockFs);

  // Test system discovery
  const workflows = configDiscovery.getAvailableWorkflows('/system');
  expect(workflows).toContain('job');

  // Test project detection
  expect(configDiscovery.isInProject('/project')).toBe(true);
});
```

## Testing Utilities

### MockSystemInterface

The core mock filesystem implementation that replaces real filesystem operations.

```typescript
// Create manually
const mockFs = new MockSystemInterface('/root/path');
mockFs.addMockFile('/path/to/file.txt', 'content');
mockFs.addMockDirectory('/path/to/dir');

// Test operations
mockFs.existsSync('/path/to/file.txt'); // true
mockFs.readFileSync('/path/to/file.txt'); // 'content'
mockFs.statSync('/path/to/file.txt').isFile(); // true
```

### ConfigDiscovery Testing

Always use dependency injection when testing ConfigDiscovery:

```typescript
// ✅ Correct - with dependency injection
const mockSystem = createFileSystemFromPaths({...});
const configDiscovery = new ConfigDiscovery(mockSystem);

// ❌ Incorrect - static methods (deprecated)
// ConfigDiscovery.findSystemRoot(); // Don't do this
```

### FileSystemBuilder API

Complete API reference for the builder pattern:

```typescript
const builder = new FileSystemBuilder('/root')
  // File operations
  .file('name.txt', 'content')
  .files({
    'file1.txt': 'content1',
    'file2.txt': 'content2',
  })

  // Directory operations
  .dir('dirname')
  .file('nested.txt', 'content')
  .back() // Exit directory

  // Bulk operations
  .dirWithFiles('configs', {
    'config1.yml': 'key1: value1',
    'config2.yml': 'key2: value2',
  })

  // Shortcuts
  .withSystemStructure() // Adds package.json
  .withWorkflow('name', options)
  .withProjectStructure('/path', configContent)

  // Navigation
  .toRoot() // Go back to root
  .getCurrentPath() // Get current path (for debugging)

  .build(); // Create MockSystemInterface
```

## Best Practices

### When to Use Each Approach

| Approach             | Best For                                  | Complexity | Maintenance |
| -------------------- | ----------------------------------------- | ---------- | ----------- |
| **Path-Based**       | Simple tests, few files                   | Low        | Easy        |
| **Builder Pattern**  | Complex structures, reusable setup        | Medium     | Medium      |
| **Fixture Files**    | Real file validation, syntax highlighting | Medium     | Easy        |
| **CLI Generator**    | Large existing directories                | Low        | Easy        |
| **Enhanced Helpers** | Standard test scenarios                   | Low        | Easy        |

### Recommended Patterns

1. **Start with Path-Based** for simple, focused tests
2. **Use Builder Pattern** for complex, reusable setups
3. **Use Fixture Files** when you need real file editing
4. **Use CLI Generator** when migrating from existing directories
5. **Use Enhanced Helpers** for standard scenarios

### Test Organization

```typescript
describe('MyComponent', () => {
  describe('simple cases', () => {
    it('should handle basic operations', () => {
      // Path-based for simple, focused tests
      const mockFs = createFileSystemFromPaths({
        '/system/package.json': JSON.stringify({ name: 'test' }),
        '/system/workflows/job/workflow.yml': 'workflow: job',
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

  describe('real file validation', () => {
    it('should validate actual templates', () => {
      // Fixture files for real file validation
      const mockFs = loadFileSystemFromFixtures('example-workflow');
      // ... test code
    });
  });
});
```

### Error Handling

```typescript
// Handle missing files gracefully
it('should handle missing files', () => {
  const mockFs = createFileSystemFromPaths({});

  expect(() => mockFs.readFileSync('/nonexistent')).toThrow('ENOENT');
  expect(mockFs.existsSync('/nonexistent')).toBe(false);
});

// Test edge cases
it('should handle edge cases', () => {
  // Empty paths
  expect(() => createFileSystemFromPaths({})).toThrow('No paths provided');

  // Root-only paths
  const mockFs = createFileSystemFromPaths({
    '/file.txt': 'content',
  });
  expect(mockFs.existsSync('/file.txt')).toBe(true);
});
```

## Advanced Usage

### Performance Considerations

```typescript
// Benchmark different approaches
it('should benchmark approaches', () => {
  const iterations = 100;

  // Path-based timing
  const pathStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    createFileSystemFromPaths({
      '/system/package.json': '{"name": "test"}',
      '/system/workflows/job/workflow.yml': 'name: job',
    });
  }
  const pathTime = performance.now() - pathStart;

  // Builder pattern timing
  const builderStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    new FileSystemBuilder('/system')
      .file('package.json', '{"name": "test"}')
      .dir('workflows')
      .dir('job')
      .file('workflow.yml', 'name: job')
      .back()
      .back()
      .build();
  }
  const builderTime = performance.now() - builderStart;

  console.log(`Path-based: ${pathTime.toFixed(2)}ms`);
  console.log(`Builder: ${builderTime.toFixed(2)}ms`);

  // Both should be reasonably fast
  expect(pathTime).toBeLessThan(1000);
  expect(builderTime).toBeLessThan(2000);
});
```

### Custom Shortcuts

```typescript
// Extend FileSystemBuilder with custom shortcuts
class CustomFileSystemBuilder extends FileSystemBuilder {
  withCustomWorkflow(name: string): this {
    return this.dir('workflows')
      .dir(name)
      .file('workflow.yml', `workflow:\n  name: "${name}"`)
      .file('custom.md', '# Custom template')
      .back()
      .back();
  }
}

// Usage
const mockFs = new CustomFileSystemBuilder('/system')
  .withSystemStructure()
  .withCustomWorkflow('special')
  .build();
```

### Debugging Mock Systems

```typescript
// Debug what paths exist
const mockFs = createFileSystemFromPaths({...});

// Check specific paths
console.log('Package exists:', mockFs.existsSync('/system/package.json'));
console.log('Workflows dir:', mockFs.existsSync('/system/workflows'));

// Use builder debugging
const builder = new FileSystemBuilder('/system')
  .file('test.txt', 'content');
console.log('Current path:', builder.getCurrentPath());
```

## Migration Guide

### From Static Mocking

**Before (deprecated):**

```typescript
// ❌ Old approach with static mocking
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;
mockFs.existsSync.mockReturnValue(true);

// ❌ Static ConfigDiscovery calls
const workflows = ConfigDiscovery.getAvailableWorkflows('/path');
```

**After (recommended):**

```typescript
// ✅ New approach with dependency injection
const mockSystem = createFileSystemFromPaths({
  '/system/package.json': '{"name": "markdown-workflow"}',
  '/system/workflows/job/workflow.yml': 'workflow: job',
});

const configDiscovery = new ConfigDiscovery(mockSystem);
const workflows = configDiscovery.getAvailableWorkflows('/system');
```

### From Nested Objects

**Before:**

```typescript
// ❌ Complex nested structure
const content: FileSystemContent = {
  name: 'system',
  dirs: [
    {
      name: 'workflows',
      dirs: [
        {
          name: 'job',
          dirs: [],
          files: { 'workflow.yml': 'workflow: job' },
        },
      ],
      files: {},
    },
  ],
  files: { 'package.json': '{"name": "test"}' },
};
```

**After:**

```typescript
// ✅ Simple path-based approach
const mockFs = createFileSystemFromPaths({
  '/system/package.json': '{"name": "test"}',
  '/system/workflows/job/workflow.yml': 'workflow: job',
});

// ✅ Or builder pattern
const mockFs = new FileSystemBuilder('/system')
  .file('package.json', '{"name": "test"}')
  .dir('workflows')
  .dir('job')
  .file('workflow.yml', 'workflow: job')
  .back()
  .back()
  .build();
```

### Updating Existing Tests

1. **Replace static mocks** with MockSystemInterface
2. **Convert ConfigDiscovery** to use dependency injection
3. **Choose appropriate approach** based on test complexity
4. **Update file paths** to match new mock structure
5. **Add proper error handling** for missing files

## Running Tests

```bash
# Run all tests
npm test

# Run specific test files
npm test tests/unit/create.test.ts

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch

# Generate mock filesystem from directory
npm run generate-mock-fs ./source-dir ./output-file.ts
```

## Troubleshooting

### Common Issues

1. **"No paths provided" error**: Ensure your paths object isn't empty
2. **"ENOENT" errors**: Check that all required files exist in your mock system
3. **ConfigDiscovery not finding workflows**: Ensure package.json exists at system root
4. **Path resolution issues**: Use absolute paths, avoid relative paths

### Debug Tips

```typescript
// Add debug output to understand mock system state
const mockFs = createFileSystemFromPaths({...});
console.log('System root:', mockFs.getCurrentFilePath());
console.log('Package exists:', mockFs.existsSync('/system/package.json'));

// Check ConfigDiscovery state
const configDiscovery = new ConfigDiscovery(mockFs);
const workflows = configDiscovery.getAvailableWorkflows('/system');
console.log('Available workflows:', workflows);
```

For more examples and detailed API documentation, see the test files in `tests/unit/` and the implementation in `tests/helpers/`.
