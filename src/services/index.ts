/**
 * Services module exports
 * 
 * Phase 2: Clean service layer with domain separation
 */

// Main orchestrator
export { WorkflowOrchestrator } from './workflow-orchestrator.js';

// Domain services
export { WorkflowService } from './workflow-service.js';
export { CollectionService } from './collection-service.js';
export { TemplateService } from './template-service.js';
export { ActionService } from './action-service.js';

// Legacy services (maintained for backward compatibility)
export { convertDocument } from './document-converter.js';
export { MermaidProcessor } from './mermaid-processor.js';
export { scrapeUrl } from './web-scraper.js';
export { PresentationApi } from './presentation-api.js';

// Converters and processors
export * from './converters/index.js';
export * from './processors/index.js';