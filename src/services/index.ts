/**
 * Services module exports
 *
 * Phase 2: Clean service layer with domain separation
 */

// Main orchestrator
export { WorkflowOrchestrator } from './workflow-orchestrator';

// Domain services
export { WorkflowService } from './workflow-service';
export { CollectionService } from './collection-service';
export { TemplateService } from './template-service';
export { ActionService } from './action-service';
export { ConfigService } from './config-service';
export { MetadataService } from './metadata-service';

// Legacy services removed - use converter registry instead
export { MermaidProcessor } from './processors/mermaid-processor';
export { scrapeUrl } from './web-scraper';
export * from './presentation-api';

// Converters and processors
export * from './converters/index';
export * from './processors/index';
