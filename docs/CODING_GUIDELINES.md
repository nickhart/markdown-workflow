# Coding Guidelines

This document defines the coding standards and best practices for the markdown-workflow project.

## TypeScript Standards

### Type Safety
- **NO `any` types** - Always use specific types or `unknown` if type is truly unknown
- Prefer `interface` over `type` for object definitions
- Use strict TypeScript configuration (strict mode enabled)
- Always define return types for functions
- Use type guards when working with `unknown` types

```typescript
// ❌ Bad
function processData(data: any): any {
  return data.someProperty;
}

// ✅ Good
interface UserData {
  id: string;
  name: string;
  email: string;
}

function processData(data: UserData): string {
  return data.name;
}
```

### Null Safety
- Use optional chaining (`?.`) and nullish coalescing (`??`) operators
- Prefer explicit null checks over truthy/falsy checks when dealing with nullable values
- Use `NonNullable<T>` type when appropriate

### Error Handling
- Use custom error classes that extend `Error`
- Always include meaningful error messages
- Prefer throwing errors over returning error objects
- Use `Result<T, E>` pattern for functions that can fail predictably

## Code Organization

### File Structure
- Use kebab-case for file names: `workflow-engine.ts`
- Use PascalCase for class names: `WorkflowEngine`
- Use camelCase for functions and variables: `processTemplate`
- Group related functionality in modules

### Imports/Exports
- Use named exports over default exports
- Group imports: external libraries first, then internal modules
- Use absolute imports with path mapping when possible

```typescript
// External imports
import { readFile } from 'fs/promises';
import { join } from 'path';

// Internal imports
import { WorkflowConfig } from '@/shared/types';
import { logger } from '@/shared/utils';
```

### Functions
- Keep functions small and focused (max 20-30 lines)
- Use descriptive names that explain what the function does
- Prefer pure functions when possible
- Always include JSDoc comments for public APIs

```typescript
/**
 * Processes a markdown template with variable substitution
 * @param template - The template content to process
 * @param variables - Key-value pairs for substitution
 * @returns The processed template content
 * @throws {TemplateError} When template syntax is invalid
 */
function processTemplate(template: string, variables: Record<string, string>): string {
  // Implementation
}
```

## Testing Standards

### Test Organization
- Use `.test.ts` suffix for test files
- Mirror source directory structure in tests
- Group tests using `describe` blocks
- Use descriptive test names that explain the scenario

### Test Quality
- Follow AAA pattern: Arrange, Act, Assert
- Use meaningful test data, avoid generic names like "foo" and "bar"
- Test both success and failure scenarios
- Mock external dependencies

```typescript
describe('WorkflowEngine', () => {
  describe('createCollection', () => {
    it('should create collection with valid workflow configuration', async () => {
      // Arrange
      const workflowConfig = createValidWorkflowConfig();
      const engine = new WorkflowEngine(workflowConfig);

      // Act
      const result = await engine.createCollection('test-collection', {});

      // Assert
      expect(result.id).toBe('test-collection');
      expect(result.status).toBe('active');
    });
  });
});
```

## Performance Guidelines

### Async Operations
- Prefer `async/await` over Promise chains
- Use `Promise.all()` for concurrent operations
- Avoid blocking operations in the main thread
- Use streams for large file operations

### Memory Management
- Dispose of resources properly (close file handles, clear timers)
- Use weak references when appropriate
- Avoid memory leaks in event handlers

## Security Guidelines

### Input Validation
- Validate all external inputs
- Sanitize file paths to prevent directory traversal
- Use schema validation for configuration files
- Never trust user-provided template content without validation

### File Operations
- Use safe file operations with proper error handling
- Validate file extensions before processing
- Implement size limits for file uploads
- Use temporary directories for intermediate files

## Code Style

### Formatting
- Use Prettier for consistent formatting
- 2 spaces for indentation
- Single quotes for strings
- Trailing commas in multi-line objects/arrays

### Comments
- Use JSDoc for public APIs
- Add inline comments for complex business logic
- Avoid obvious comments that restate the code
- Keep comments up-to-date with code changes

### Naming Conventions
- Use descriptive names that explain intent
- Avoid abbreviations unless they're widely understood
- Use consistent terminology throughout the codebase
- Prefix private methods with underscore: `_processInternal()`

## Git Commit Guidelines

### Commit Messages
- Use conventional commit format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Keep first line under 50 characters
- Include body for complex changes

```
feat(cli): add migrate command for workflow transitions

- Implement collection migration between workflows
- Add validation for compatible workflow schemas  
- Include unit tests and e2e test coverage
```

### Branch Naming
- Use descriptive branch names: `feature/migrate-command`
- Prefix with type: `feature/`, `bugfix/`, `hotfix/`
- Use kebab-case for branch names

## Dependencies

### Package Management
- Use `pnpm` for package management
- Pin exact versions for production dependencies
- Use `devDependencies` for development-only packages
- Regularly audit and update dependencies

### Third-party Libraries
- Prefer well-maintained libraries with good TypeScript support
- Evaluate bundle size impact for client-side code
- Document any non-obvious library choices in ADRs
- Avoid libraries with security vulnerabilities

## Documentation

### Code Documentation
- Document all public APIs with JSDoc
- Include examples in documentation
- Keep README files up-to-date
- Document breaking changes in CHANGELOG

### Architecture Documentation
- Use ADRs for significant architectural decisions
- Document design patterns and their rationale
- Include diagrams for complex systems
- Keep documentation close to relevant code