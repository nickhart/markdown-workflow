# Coding Guidelines

This document outlines the coding standards and style preferences for the markdown-workflow project.

## TypeScript Import Style (ES Modules)

### ✅ Correct - ALWAYS use .js extensions:

```typescript
import { ConfigService } from '../../../../src/services/config-service.js';
import { WorkflowEngine } from '../../../../src/engine/workflow-engine.js';
```

### ❌ Incorrect - Do NOT omit file extensions:

```typescript
import { ConfigService } from '../../../../src/services/config-service';
import { WorkflowEngine } from '../../../../src/engine/workflow-engine';
```

**Rationale:**

- This project uses ES modules (`"type": "module"` in package.json)
- ES modules require explicit file extensions for imports
- Use `.js` extension even when importing from `.ts` files
- TypeScript compiles `.ts` → `.js`, so runtime expects `.js` extensions
- Jest moduleNameMapper handles the mapping during testing
- This follows ES modules standards and TypeScript ESM best practices

## Other Style Guidelines

### File Naming

- Use kebab-case for file names: `config-service.ts`, `workflow-engine.ts`
- Use PascalCase for class names: `ConfigService`, `WorkflowEngine`

### Directory Structure

- Service classes in `src/services/`
- Engine classes in `src/engine/`
- CLI utilities in `src/cli/shared/`
- Tests mirror source structure: `tests/unit/services/`, `tests/unit/cli/`

### Code Organization

- Prefer composition over inheritance
- Use dependency injection for testability
- Keep business logic in services, presentation logic in CLI/API layers
- Use TypeScript strict mode - no `any` types without explicit justification

## Import Guidelines

### Path Resolution

- Use relative paths for local imports
- Use absolute paths from project root when crossing major boundaries
- Prefer specific imports over barrel exports for better tree-shaking

### Example:

```typescript
// ✅ Good - Relative path within same module
import { logError } from './console-output';

// ✅ Good - Specific import from services
import { ConfigService } from '../../services/config-service';

// ✅ Good - Engine import
import { WorkflowEngine } from '../../engine/workflow-engine';
```

## Testing Standards

### Mock Organization

- Mock external dependencies at module level
- Use proper TypeScript typing for mocks
- Clean up mocks in `beforeEach` blocks
- Document complex mock setups

### Test Structure

- Descriptive test names that explain behavior
- Group related tests in `describe` blocks
- Use `it.skip` with TODO comments for temporarily disabled tests
- Include proper assertions with meaningful error messages

## Documentation

### Code Comments

- Use JSDoc for public APIs
- Explain "why" not "what" in comments
- Document complex business logic
- Keep comments up-to-date with code changes

### README and Docs

- Keep CLAUDE.md updated with architectural changes
- Document breaking changes and migration paths
- Include usage examples for new features
- Maintain SKIPPED_TESTS.md for disabled tests
