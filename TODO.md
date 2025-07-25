# TODO - Markdown Workflow Project

## 🚀 Core Features (High Priority)

### Workflow Distribution System

- [ ] **Workflow Creation Commands**
  - [ ] `wf create-workflow <name>` - Create a new workflow from scratch
  - [ ] `wf pack-workflow <name>` - Package a workflow for distribution
  - [ ] `wf publish-workflow <name>` - Publish workflow to repository
  - [ ] Interactive workflow creation wizard

- [ ] **Workflow Import/Export**
  - [ ] `wf import <workflow-name>` - Import workflow from repository
  - [ ] `wf init <workflow-name>` - Initialize project with specific workflow
  - [ ] `wf export <workflow-name>` - Export local workflow for sharing
  - [ ] Support for workflow dependencies and versioning

- [ ] **Public Workflow Repository**
  - [ ] Central repository for community workflows
  - [ ] Workflow search and discovery
  - [ ] Rating and review system
  - [ ] Workflow categories and tags
  - [ ] Version management and updates

### Workflow Management

- [ ] **Local Workflow Operations**
  - [ ] `wf list-workflows` - List available workflows
  - [ ] `wf update-workflow <name>` - Update workflow from repository
  - [ ] `wf remove-workflow <name>` - Remove workflow from local system
  - [ ] `wf workflow-info <name>` - Show workflow details and metadata

- [ ] **Workflow Validation**
  - [ ] Schema validation for workflow.yml files
  - [ ] Template validation and linting
  - [ ] Dependency checking
  - [ ] Breaking change detection

## 🔧 Technical Implementation (Medium Priority)

### Core System Improvements

- [x] **YAML Configuration**
  - [x] Implement proper YAML parsing for config files
  - [x] Support for YAML workflow definitions
  - [x] Configuration validation and error handling (with Zod)
  - [x] Migration from JSON to YAML

- [x] **Template Engine**
  - [x] Implement TemplateProcessor.ts (integrated into create.ts)
  - [x] Advanced template variable substitution (with Mustache)
  - [x] Conditional template rendering
  - [x] Template inheritance and composition

- [x] **Workflow Engine**
  - [x] Implement WorkflowEngine.ts
  - [x] Collection state management
  - [x] Workflow execution engine
  - [x] Action and converter system
  - [ ] Add migrate command
  - [ ] add import command? could make future migrations easier, or allow custom migrations

### CLI Commands

- [x] **Collection Management**
  - [x] `wf-create` - Create new collection
  - [x] `wf-status` - Update collection status
  - [x] `wf-list` - List collections
  - [x] `wf-format` - Format collection documents
  - [x] `wf add` - Add items from templates to existing collections
  - [x] `wf-init` - Initialize project with workflows

- [ ] **Advanced Features**
  - [ ] `wf-search` - Search collections and workflows
  - [ ] `wf-migrate` - Migrate between workflow versions

## 📦 Repository Structure (Low Priority)

### Workflow Package Format

- [ ] **Package Definition**
  - [ ] Workflow manifest format
  - [ ] Template organization standards
  - [ ] Asset bundling (images, styles, etc.)
  - [ ] Dependency declaration

- [ ] **Distribution Format**
  - [ ] Compressed workflow packages (.wf files)
  - [ ] Digital signing and verification
  - [ ] Incremental updates
  - [ ] Cross-platform compatibility

### Repository Infrastructure

- [ ] **Backend Services**
  - [ ] Workflow repository API
  - [ ] User authentication and authorization
  - [ ] Package storage and CDN
  - [ ] Search and indexing service

- [ ] **Frontend Interface**
  - [ ] Web portal for workflow browsing
  - [ ] Workflow documentation generator
  - [ ] Community features (comments, ratings)
  - [ ] Analytics and usage tracking

## 🧪 Testing & Quality (Ongoing)

### Test Coverage

- [x] **Unit Tests**
  - [x] TemplateProcessor tests
  - [x] WorkflowEngine tests
  - [x] CLI command tests
  - [x] Configuration tests
  - [x] Mock filesystem utilities

- [x] **Integration Tests**
  - [x] End-to-end workflow execution
  - [x] Snapshot-based regression testing
  - [x] TurboRepo build caching
  - [ ] Cross-platform compatibility tests
  - [ ] Performance benchmarks

### Documentation

- [ ] **User Documentation**
  - [ ] Complete user guide
  - [ ] Workflow creation tutorial
  - [ ] API documentation
  - [ ] Migration guides

- [ ] **Developer Documentation**
  - [ ] Architecture documentation
  - [ ] Plugin development guide
  - [ ] Contributing guidelines
  - [ ] API reference

## 🎯 Future Enhancements (Ideas)

### Advanced Features

- [ ] **Plugin System**
  - [ ] Custom converters (pandoc alternatives)
  - [ ] Custom actions and workflows
  - [ ] Third-party integrations

- [ ] **Collaboration Features**
  - [ ] Shared collections
  - [ ] Real-time collaboration
  - [ ] Version control integration
    - `wf commit artifact_id` will commit the artifact, and just the artifact.
    - with a default message? (eg: 'moved from submitted to interview')
  - [ ] Team workflows

- [ ] **AI Integration**
  - [ ] AI-powered template suggestions
  - [ ] Content generation assistance
  - [ ] Workflow optimization recommendations
  - [ ] Intelligent template matching

### Platform Expansion

- [ ] **Web Interface**
  - [ ] Browser-based workflow editor
  - [ ] Online collection management
  - [ ] Mobile-responsive design
  - [ ] Offline synchronization

## 📝 Implementation Notes

### Development Phases

1. **Phase 1**: Core workflow distribution (create, pack, import)
2. **Phase 2**: Public repository infrastructure
3. **Phase 3**: Advanced features and UI
4. **Phase 4**: Community and collaboration features

### Technical Decisions

- Use semantic versioning for workflows
- Support both local and remote workflow repositories
- Ensure backward compatibility during updates
- Implement proper error handling and recovery

### Community Considerations

- Open source workflow repository
- Clear licensing for community workflows
- Moderation and quality control
- Documentation standards for workflows

---

_This TODO list represents the future vision for the markdown-workflow project. Items are prioritized based on user value and technical feasibility._
