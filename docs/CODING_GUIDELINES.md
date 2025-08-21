# Coding Guidelines

This document defines the coding standards and best practices for the markdown-workflow project.

## TypeScript Standards

### Type Safety

- **ZERO `any` types allowed** - This is enforced by ESLint error rule
- **Always use specific types** or `unknown` if type is truly unknown
- **Prefer nullish coalescing (`??`)** over logical OR (`||`) for default values
- Prefer `interface` over `type` for object definitions
- Use strict TypeScript configuration (strict mode enabled)
- Always define return types for functions
- Use type guards when working with `unknown` types

#### Enforced Rules

Our ESLint configuration enforces these rules as **errors** (not warnings):

```json
{
  "@typescript-eslint/no-any": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }
  ]
}
```

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

- **Always use nullish coalescing (`??`)** instead of logical OR (`||`) for default values
- Use optional chaining (`?.`) for safe property access
- Prefer explicit null checks over truthy/falsy checks when dealing with nullable values
- Use `NonNullable<T>` type when appropriate

```typescript
// ❌ Bad - logical OR can cause issues with falsy values
const name = user.name || 'Unknown';

// ✅ Good - nullish coalescing only triggers on null/undefined
const name = user.name ?? 'Unknown';
```

### Error Handling

- Use custom error classes that extend `Error`
- Always include meaningful error messages
- Prefer throwing errors over returning error objects
- Use `Result<T, E>` pattern for functions that can fail predictably

## Code Organization

### File Structure

- Use kebab-case for folders: `api-clients/`
- Use kebab-case for utilities/services: `workflow-engine.ts`
- Use PascalCase for React file names: `MyComponent.tsx`
- Use PascalCase for class names: `WorkflowEngine`
- Use camelCase for functions and variables: `processTemplate`
- Group related functionality in modules

### Imports/Exports

- Use named exports over default exports
- Group imports: external libraries first, then internal modules
- Use absolute imports with path mapping when possible

#### For Web/Bundled Code (Next.js, Vite, etc.)

Use absolute imports with path mapping when possible:

```typescript
// External imports
import { readFile } from 'fs/promises';
import { join } from 'path';

// Internal imports
import { WorkflowConfig } from '@/shared/types';
import { logger } from '@/shared/utils';
```

#### For Node.js/CLI Code

Use relative imports for Node.js runtime compatibility:

```typescript
// External imports
import { readFile } from 'fs/promises';
import { join } from 'path';

// Internal imports (required for Node.js)
import { WorkflowConfig } from '../../shared/types.js';
import { logger } from '../utils/logger.js';
```

**Important Notes**

- Path mapping (@/) only works with bundlers - Node.js cannot resolve these paths at runtime
- Always include .js extensions for ES modules compatibility
- CLI and server code must use relative imports unless using transformation tools like tsc-alias
- Shared modules that need to work in both environments should use relative imports

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
- use dependency injection/mocking for network calls

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

- Validate all external inputs (use Zod!)
- Sanitize file paths to prevent directory traversal
- Use schema validation for configuration files (convert to JSON and use Zod!)
- Never trust user-provided template content without validation

### File Operations

- Use safe file operations with proper error handling
- Validate file extensions before processing
- Implement size limits for file uploads
- Use temporary directories for intermediate files

## Code Style

### Formatting

We use Prettier for consistent formatting with these settings:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

- **2 spaces** for indentation (no tabs)
- **Single quotes** for strings
- **Trailing commas** in multi-line objects/arrays
- **100 character line width** for readability
- **Semicolons always** for clarity

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

```text
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
