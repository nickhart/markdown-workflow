# Markdown Workflow Roadmap

> **Status**: Focusing on v1.0 Release Quality  
> **Priority**: Code quality, architecture simplification, and professional polish  
> **Philosophy**: Ship v1.0 with solid, working features that solve the primary use case well

## 🎯 Current State

**All Tests Passing**: ✅ All unit and integration tests  
**CLI Functionality**: ✅ Fully working for primary use cases  
**Architecture**: ✅ Clean service layer with domain separation

### ✅ Recently Completed

- **Phase 1**: Directory consolidation (`core/`, `shared/`, `lib/` → `engine/`, `services/`, `utils/`)
- **Phase 2**: Service layer architecture (broke monolithic `WorkflowEngine` into focused services)
- **Processor System**: Modular architecture with Mermaid, PlantUML, Emoji, Graphviz support
- **Template System**: Mustache-based with inheritance and project overrides
- **Testing Framework**: Comprehensive unit tests and E2E snapshot testing

## 🚀 V1.0 Release Priorities

### Phase 1: Documentation & Standards ⏳

_Current Phase - Estimated: 30 minutes_

- [x] **Consolidate Documentation**
  - [x] Merge TODO.md and FUTURE_ARCHITECTURE_PHASES.md into this ROADMAP.md
  - [ ] Create focused V1_RELEASE_PLAN.md
  - [ ] Update CODING_GUIDELINES.md with strict TypeScript rules
  - [ ] Remove duplicate/outdated documentation

### Phase 2: Code Quality & Lint Fixes 📋

_Next Phase - Estimated: 2-3 hours_

- [ ] **Fix Immediate Issues**
  - [ ] Fix 12 lint warnings (unused variables in tests and scripts)
  - [ ] Fix environment initialization error in tests (`config-discovery` issue)

- [ ] **Enforce Strict Standards**
  - [ ] Add `@typescript-eslint/no-any: "error"` to eslint config
  - [ ] Add `@typescript-eslint/prefer-nullish-coalescing: "error"`
  - [ ] Add Prettier configuration file
  - [ ] Consistent import/export patterns across codebase

### Phase 3: Architecture Simplification 🏗️

_Estimated: 1-2 hours_

- [ ] **CLI Cleanup & Service Boundaries**
  - [ ] Move business logic from `src/cli/shared/template-processor.ts` to `src/services/`
  - [ ] Extract configuration logic from `src/cli/shared/cli-base.ts` to services
  - [ ] Move metadata processing from `src/cli/shared/metadata-utils.ts` to services
  - [ ] Ensure CLI only handles I/O, parsing, and console output

- [ ] **Legacy Code Safety**
  - [ ] Mark `migrate.ts` as experimental with warnings
  - [ ] Add user confirmation for destructive operations

### Phase 4: Quality Gates & CI 🛡️

_Estimated: 1 hour_

- [ ] **Enhanced Linting & Automation**
  - [ ] Pre-commit hooks for linting and formatting
  - [ ] Update CI/CD to enforce quality standards
  - [ ] Verify 100% test coverage maintenance

### Phase 5: Release Polish ✨

_Final Phase - Estimated: 1-2 hours_

- [ ] **User Experience**
  - [ ] Review all CLI help text and error messages
  - [ ] Ensure consistent command naming and options
  - [ ] Add clear installation instructions to README
  - [ ] Create "Getting Started" tutorial

- [ ] **Package Preparation**
  - [ ] Update package.json to version 1.0.0
  - [ ] Create CHANGELOG.md for v1.0.0
  - [ ] Verify global installation works (`setup.sh`)
  - [ ] Test installation on clean systems

## 📊 V1.0 Success Metrics

- [ ] **Quality Standards**
  - Zero lint errors or warnings
  - 100% test coverage maintained
  - All tests pass consistently
  - No use of `any` types in codebase

- [ ] **User Experience**
  - New user productive in < 5 minutes
  - Installation works on macOS, Linux, Windows
  - Common workflows feel natural and fast
  - CLI operations are snappy (< 1s for common tasks)

- [ ] **Architecture Quality**
  - Clear separation between CLI I/O and business logic
  - Services are reusable for future API implementation
  - No business logic in CLI command handlers
  - Consistent patterns across all services

## 🔮 Post-V1.0 Roadmap (Deferred)

### v1.1.0 - Blog Workflow Completion

- Complete blog workflow CLI integration
- Blog-specific commands (`wf create blog`, status management)
- HTML generation and publishing workflow

### v1.2.0 - API & Web Interface

- Stabilize REST API endpoints
- Web interface for collection management
- API documentation and testing
- Authentication system

### v2.0.0 - Workflow Distribution

- `wf create-workflow` - Create custom workflows
- `wf pack-workflow` - Package workflows for sharing
- `wf import-workflow` - Import community workflows
- Public workflow repository

### Future Considerations

- Plugin system and extensibility
- Performance optimizations
- Advanced collaboration features
- Third-party integrations (GitHub, GitJournal)

## 🎯 Design Principles

Following **ADR 002: Simplicity Over Completeness**:

- ✅ Solve the common case well (80% of use cases)
- ✅ Keep code simple and maintainable
- ✅ Accept manual intervention for edge cases
- ✅ Optimize for developer productivity
- ✅ Less code = less tests = less maintenance

## 🏗️ Architecture Guidelines

### Thin Wrapper Principle

**CLI and future REST API are thin wrappers around shared business logic.**

#### Layer Responsibilities

**Interface Layers** (`src/cli/`, future `src/api/`):

- Command/argument parsing (CLI) or HTTP handling (API)
- File system discovery and I/O operations
- Console output formatting and user interaction
- Authentication and authorization (API)

**Business Logic** (`src/services/`, `src/utils/`):

- Workflow orchestration and execution
- Configuration parsing, validation, and merging
- Template processing and variable substitution
- Document conversion and processing
- Collection and item management

#### Correct Separation Example

```typescript
// ✅ CLI: Discovers files, delegates business logic
const configPaths = await discoverConfigFiles(workingDir);
const configData = await readConfigFiles(configPaths);
const config = await ConfigService.validateAndMerge(configData);

// ✅ Service: Pure business logic, no I/O
class ConfigService {
  static async validateAndMerge(configData: unknown): Promise<ProjectConfig> {
    // Validation and merging logic only
  }
}
```

## 📝 Working Features (Current v0.1.0)

### Core CLI Commands

- ✅ `wf init` - Initialize project with workflows
- ✅ `wf create job` - Create job applications with templates
- ✅ `wf create presentation` - Create presentations with Mermaid support
- ✅ `wf status` - Update collection status (active → submitted → interview → etc.)
- ✅ `wf list` - List collections with filtering
- ✅ `wf format` - Convert markdown to DOCX/PPTX with smart processor selection
- ✅ `wf add` - Add items (like interview notes) to existing collections
- ✅ `wf update` - Update collection metadata and scrape URLs
- ✅ `wf commit` - Git commit with proper handling of moved files
- ✅ `wf migrate` - Migrate from legacy bash-based system

### Technical Features

- ✅ **Template System**: Mustache-based with inheritance and project overrides
- ✅ **Processor System**: Mermaid, PlantUML, Emoji, Graphviz with smart selection
- ✅ **Web Scraping**: Reliable fallback chain (wget → curl → native HTTP)
- ✅ **Configuration**: YAML-based with Zod schema validation
- ✅ **Testing**: Comprehensive unit tests and E2E snapshot testing
- ✅ **Build System**: TurboRepo caching for fast development

---

**Target Release**: Within 1 week  
**Focus**: Professional-grade code quality and user experience  
**Outcome**: Publishable open-source tool ready for blog post and community adoption
