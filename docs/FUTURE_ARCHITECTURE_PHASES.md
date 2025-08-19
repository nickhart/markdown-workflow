# Future Architecture Phases Roadmap

**Status**: Post Phase 2 Completion
**All Tests Passing**: ✅ 432/432 tests
**CLI Functionality**: ✅ Fully working

## Completed Phases

### ✅ Phase 1: Directory Consolidation

- Unified `core/`, `shared/`, `lib/` → `engine/`, `services/`, `utils/`
- Updated all import paths and tests
- Clean directory structure established

### ✅ Phase 2: Service Layer Architecture

- Broke monolithic `WorkflowEngine` (1000+ lines) into focused domain services
- Created `WorkflowOrchestrator` to coordinate services
- Implemented Single Responsibility Principle
- Fixed TypeScript lint issues (`any` → proper types)
- Updated all CLI commands and tests to use new architecture
- **Result**: Clean, testable, maintainable service layer

## Upcoming Phases

### Phase 3: CLI Cleanup and Refactoring

**Priority**: High
**Estimated Effort**: 2-3 days

#### Goals

- Improve CLI code organization and maintainability
- Better separation between CLI-specific and shared logic
- Enhanced user experience and safety features
- Cleaner, more intuitive file naming and structure

#### Tasks

1. **Enforce Thin Wrapper Architecture**
   - Move workflow business logic from `template-processor.ts` to `src/services/`
   - Extract configuration validation/merging from `cli-base.ts` to shared services
   - Move metadata processing logic from `metadata-utils.ts` to `src/services/`
   - Remove workflow orchestration from main CLI entry point - CLI should only parse commands

2. **File Naming & Structure Clarity**
   - Rename `formatting-utils.ts` to `console-output.ts` (CLI presentation layer)
   - Separate CLI I/O operations from business logic validation
   - Organize imports: CLI modules only import from `src/services/` and `src/utils/`
   - Ensure shared services have no CLI dependencies

3. **Legacy Code & Safety**
   - Mark `migrate.ts` as experimental with appropriate warnings
   - Add safety checks to prevent destructive operations by default
   - Consider deprecating legacy `markdown-writer` CLI support
   - Add user confirmation for potentially destructive actions

4. **Interface Layer Discipline**
   - CLI layer: Command parsing, file discovery, console output only
   - Shared services: Configuration validation, workflow execution, template processing
   - Clear boundaries: No filesystem operations in shared services
   - Prepare foundation for REST API to use same shared services

#### Files to Focus On

- `src/cli/shared/template-processor.ts` - Extract shared logic
- `src/cli/shared/formatting-utils.ts` - Rename and reorganize
- `src/cli/shared/cli-base.ts` - Identify Web-shareable logic
- `src/cli/shared/metadata-utils.ts` - Move platform-agnostic code
- `src/cli/commands/migrate.ts` - Add experimental warnings
- `src/cli/index.ts` - Remove workflow-specific logic

#### Success Criteria

- **Thin Wrapper Compliance**: CLI only handles command parsing, file I/O, and console output
- **Shared Business Logic**: All workflow logic moved to `src/services/` for CLI/API reuse
- **Interface Isolation**: No CLI dependencies in shared services
- **Clear Layer Boundaries**: CLI imports services, services don't import CLI modules
- **Foundation for API**: Shared services ready for REST API consumption
- **Experimental Safety**: Destructive features marked with warnings and confirmations

### Phase 4: API & Web Interface Enhancement

**Priority**: Low
**Estimated Effort**: 3-5 days

#### Goals

- Complete REST API implementation
- Enhanced web interface with full feature parity
- Authentication and authorization system
- Rate limiting and request validation

#### Tasks

1. **API Completeness**
   - Complete all REST endpoints for workflow operations
   - Add comprehensive API documentation (OpenAPI/Swagger)
   - Implement proper error handling and status codes
   - Add API versioning strategy

2. **Authentication System**
   - JWT token-based authentication
   - API key management
   - Role-based access control (if needed)
   - Session management for web interface

3. **Web Interface**
   - Complete React components for all CLI features
   - Real-time updates (WebSocket connections)
   - File upload/download capabilities
   - Responsive design improvements

4. **Security & Performance**
   - CORS configuration
   - Rate limiting implementation
   - Request validation middleware
   - Caching strategy for frequently accessed data

#### Files to Focus On

- `src/app/api/**` - REST API routes
- `src/app/**` - Next.js components and pages
- Add authentication middleware
- API documentation in `docs/api/`

### Phase 5: Plugin System & Extensibility

**Priority**: High
**Estimated Effort**: 4-6 days

#### Goals

- Dynamic processor/converter discovery
- User-defined workflows and processors
- Plugin marketplace/sharing system
- Hot reloading of plugins

#### Tasks

1. **Plugin Infrastructure**
   - Plugin discovery mechanism
   - Plugin manifest system (package.json-like)
   - Sandboxed plugin execution
   - Plugin dependency management

2. **Dynamic Loading**
   - Runtime processor registration
   - Hot reloading without restart
   - Plugin configuration validation
   - Error isolation per plugin

3. **User-Defined Workflows**
   - Custom workflow definition format
   - Template inheritance system
   - Workflow validation and testing
   - Publishing/sharing mechanism

4. **Plugin Marketplace**
   - Plugin repository structure
   - Search and discovery
   - Version management
   - Community ratings/reviews

#### Implementation Strategy

```
src/
├── plugins/
│   ├── discovery/
│   │   ├── plugin-scanner.ts
│   │   ├── manifest-validator.ts
│   │   └── dependency-resolver.ts
│   ├── registry/
│   │   ├── plugin-registry.ts
│   │   ├── processor-registry.ts  # Extend existing
│   │   └── converter-registry.ts  # Extend existing
│   ├── sandbox/
│   │   ├── plugin-sandbox.ts
│   │   ├── security-policy.ts
│   │   └── resource-limiter.ts
│   └── marketplace/
│       ├── plugin-store.ts
│       ├── version-manager.ts
│       └── community-api.ts
```

### Phase 6: Environment Abstraction System

**Priority**: High
**Estimated Effort**: 3-4 days

#### Goals

- Unified Environment abstraction for all resources (configs, workflows, processors, converters, templates)
- Multiple environment population methods (programmatic, filesystem, archives)
- Smart resource merging and fallback resolution (local → global)
- Lazy loading of resources for specific workflows
- Robust security and validation for web/REST integration

#### Tasks

1. **Core Environment Architecture**
   - Abstract `Environment` class with unified resource access interface
   - `FilesystemEnvironment` implementation for directory-based loading
   - `MemoryEnvironment` implementation for programmatic/in-memory resources
   - `ArchiveEnvironment` implementation for ZIP file extraction
   - `MergedEnvironment` for intelligent local → global fallback resolution

2. **Environment Population Methods**
   - **Programmatic**: Code-defined folder/file structure via API
   - **Filesystem**: Walk directory structure and populate resources
   - **Archive-based**: Extract from ZIP files (cross-platform support)
   - **Request-based**: Populate from HTTP multipart uploads (REST/Web)

3. **Security & Validation Framework**
   - File size limits by extension (configurable, per-extension defaults)
   - YAML/JSON schema validation against Zod schemas
   - Input sanitization for web security (filename validation, path traversal protection)
   - Unknown file extension handling (warnings + empty placeholders)
   - Resource limits and timeouts for processing
   - Content-type validation for uploaded files

4. **Smart Resource Management**
   - `WorkflowContext` for lazy loading specific workflow resources
   - Dependency tracking (only load processors/converters used by workflow)
   - Efficient caching and invalidation strategies
   - Memory usage monitoring and limits

#### Implementation Strategy

```
src/
├── engine/
│   ├── environment/
│   │   ├── environment.ts              # Abstract Environment class
│   │   ├── filesystem-environment.ts   # Loads from disk
│   │   ├── memory-environment.ts       # In-memory implementation
│   │   ├── archive-environment.ts      # ZIP file extraction
│   │   ├── merged-environment.ts       # Local + global merging
│   │   ├── request-environment.ts      # HTTP upload handling
│   │   ├── workflow-context.ts         # Lazy loading for workflows
│   │   ├── environment-factory.ts      # Creates appropriate environments
│   │   └── security-validator.ts       # File validation & sanitization
│   └── environment-discovery.ts        # Replaces config-discovery.ts
```

#### Security Considerations

**File Size Limits** (per extension, configurable):

- Text files (`.yml`, `.yaml`, `.json`, `.md`): 100KB default
- Images (`.png`, `.jpg`, `.jpeg`, `.svg`): 500KB default
- Documents (`.docx`, `.pdf`): 1MB default
- Archives (`.zip`): 5MB total default
- Nested archive depth: 3 levels maximum

**Input Validation**:

- Filename sanitization (no path traversal: `../`, absolute paths)
- Extension allowlist: `.yml`, `.yaml`, `.md`, `.json`, `.docx`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.pdf`
- MIME type validation for uploads
- Virus scanning integration point (future)

**Content Validation**:

- YAML/JSON files validated against Zod schemas
- Markdown files: basic structure validation
- Binary files: size and type checking only
- Unknown extensions: warning + empty placeholder creation

**Resource Limits**:

- Archive extraction timeout: 30 seconds
- Memory usage cap during processing: 100MB
- Maximum files per environment: 500
- Concurrent processing limit: 3 environments

#### Example Usage

```typescript
// CLI: Filesystem-based environments
const globalEnv = new FilesystemEnvironment('/usr/local/lib/markdown-workflow');
const localEnv = new FilesystemEnvironment('./.markdown-workflow');
const mergedEnv = new MergedEnvironment(localEnv, globalEnv);

// REST API: Request-based environment
const uploadedEnv = new RequestEnvironment(uploadedFiles, globalEnv);
const context = new WorkflowContext(uploadedEnv, 'job-applications');

// Programmatic: Code-defined structure
const memoryEnv = new MemoryEnvironment();
await memoryEnv.setConfig(userConfig);
await memoryEnv.setWorkflow('custom', workflowDef);
```

#### Benefits

- **Unified Interface**: Single abstraction for all resource access
- **REST Integration**: Easy environment population from HTTP uploads
- **Performance**: Lazy loading only resources needed for current workflow
- **Security**: Comprehensive validation and sanitization for web uploads
- **Testability**: Easy mocking with MemoryEnvironment
- **Flexibility**: Support for archives, filesystems, and programmatic definition

#### Migration Strategy

1. **Phase 6a**: Create Environment abstractions alongside existing ConfigDiscovery
2. **Phase 6b**: Migrate WorkflowEngine to use Environment system
3. **Phase 6c**: Update CLI commands to use WorkflowContext
4. **Phase 6d**: Implement REST endpoints with RequestEnvironment
5. **Phase 6e**: Remove legacy ConfigDiscovery and direct filesystem access

### Phase 7: Performance & Scalability

**Priority**: Medium
**Estimated Effort**: 2-3 days

#### Goals

- Parallel processing of documents
- Caching system for expensive operations
- Background job processing
- Memory usage optimization

#### Tasks

1. **Parallel Processing**
   - Worker thread implementation for document conversion
   - Batch processing capabilities
   - Progress tracking and cancellation
   - Resource pool management

2. **Caching System**
   - Template compilation caching
   - Mermaid/PlantUML diagram caching (already started)
   - Configuration caching
   - Smart cache invalidation

3. **Background Jobs**
   - Queue system for long-running operations
   - Job progress tracking
   - Retry mechanisms for failed jobs
   - Job scheduling capabilities

4. **Memory Optimization**
   - Streaming file processing for large documents
   - Lazy loading of resources
   - Memory profiling and leak detection
   - Garbage collection optimization

### Phase 8: Enhanced Testing & Quality

**Priority**: Medium
**Estimated Effort**: 2-3 days

#### Goals

- Comprehensive integration tests
- Performance benchmarking
- End-to-end testing automation
- Code coverage improvements

#### Tasks

1. **Integration Testing**
   - Full workflow integration tests
   - Cross-service communication tests
   - Database integration tests (if applicable)
   - External service mocking

2. **Performance Testing**
   - Benchmark suite for document conversion
   - Memory usage profiling
   - Concurrency testing
   - Load testing for API endpoints

3. **E2E Testing**
   - Automated CLI testing with real file systems
   - Web interface E2E tests (Playwright/Cypress)
   - Cross-platform testing (Windows/Mac/Linux)
   - Docker-based test environments

4. **Quality Metrics**
   - Code coverage reporting
   - Complexity analysis
   - Security vulnerability scanning
   - Documentation coverage

### Phase 9: Advanced Features

**Priority**: Low
**Estimated Effort**: 3-4 days

#### Goals

- Advanced template features
- Collaboration capabilities
- Version control integration
- Advanced reporting

#### Tasks

1. **Advanced Templates**
   - Conditional template rendering
   - Loop constructs in templates
   - Template includes and partials
   - Dynamic template generation

2. **Collaboration**
   - Multi-user workflow sharing
   - Real-time collaborative editing
   - Comment and review system
   - Team workspaces

3. **Version Control**
   - Advanced Git integration
   - Branch-based workflows
   - Merge conflict resolution
   - Automated commit message generation

4. **Reporting & Analytics**
   - Workflow usage analytics
   - Performance metrics dashboard
   - Export/import capabilities
   - Custom report generation

## Implementation Priority

### Immediate Next Steps (Phase 3)

1. Extract shared logic from CLI-specific modules
2. Rename and reorganize files for better clarity
3. Add safety warnings to experimental features
4. Remove workflow-specific logic from main CLI entry point

### Quick Wins Available

- **Processor Enhancements**: Add more diagram types (Graphviz already started)
- **Template Features**: Enhanced variable substitution with conditionals
- **Configuration**: Better validation and error messages
- **Documentation**: User guides and tutorials

### Low-Hanging Fruit

- **CLI Improvements**: Better help text, command autocomplete
- **Error Handling**: More informative error messages
- **Logging**: Structured logging with different levels
- **Config**: Environment variable support

## Technical Debt to Address

### Current Architecture Strengths

- ✅ Clean service layer separation
- ✅ Strong TypeScript typing
- ✅ Comprehensive test coverage
- ✅ Well-organized directory structure
- ✅ Good CLI/business logic separation

### Areas for Improvement

- **Legacy Code**: Some remaining legacy functions in `workflow-operations.ts`
- **Error Handling**: Inconsistent error handling patterns
- **Configuration**: Complex config discovery logic could be simplified
- **Documentation**: API documentation needs completion

## Core Design Principle: Thin Wrapper Architecture

### Interface Layer Separation

**CLI and REST API are thin wrappers around shared workflow logic.**

#### Interface Layer Responsibilities

- **CLI Layer** (`src/cli/`):
  - Command/argument parsing
  - File system discovery and I/O operations
  - Console output formatting and user interaction
  - Directory traversal and file path resolution
- **REST API Layer** (`src/api/`):
  - HTTP request/response handling
  - JSON serialization/deserialization
  - Authentication and authorization
  - HTTP-specific error handling

#### Shared Business Logic (`src/services/`, `src/utils/`)

- **Workflow orchestration and execution**
- **Configuration parsing, validation, and merging**
- **Template processing and variable substitution**
- **Document conversion and processing**
- **Collection and item management**
- **Metadata handling and validation**

#### Examples of Proper Separation

✅ **Correctly Separated**:

```typescript
// CLI: Discovers config files from filesystem
const configPaths = await discoverConfigFiles(workingDir);
const configData = await readConfigFiles(configPaths);

// Shared: Validates and merges configuration
const config = await ConfigService.validateAndMerge(configData);

// REST API: Receives config in HTTP request body
const configData = req.body.config;

// Shared: Same validation and merging logic
const config = await ConfigService.validateAndMerge(configData);
```

❌ **Incorrectly Mixed**:

```typescript
// CLI module doing business logic validation (wrong layer)
function validateWorkflowConfig(config) {
  /* business logic */
}

// Business logic doing CLI file discovery (wrong layer)
function processWorkflow() {
  const files = fs.readdirSync('./workflows'); // CLI concern
}
```

## Recommended Approach

### Phase-by-Phase Strategy

1. **Start with Phase 3 (CLI Cleanup)** - Quick wins, enforces thin wrapper principle
2. **Then Phase 5 (Plugin System)** - Highest value, enables community contributions
3. **Follow with Phase 4 (API/Web)** - Improves usability and accessibility
4. **Continue with Phase 6 (Performance)** - Optimize based on real usage patterns
5. **Complete with Phases 7-8** - Polish and advanced features

### Development Guidelines

- **Thin Wrapper Principle**: CLI/API handle I/O, services handle business logic
- **Maintain Test Coverage**: Keep 100% test coverage for new features
- **API-First Design**: Design shared services before interface implementation
- **Documentation**: Update docs with each feature
- **Backward Compatibility**: Maintain CLI compatibility throughout

This roadmap provides a clear path forward while maintaining the excellent foundation established in Phases 1 and 2, and enforcing proper architectural separation.
