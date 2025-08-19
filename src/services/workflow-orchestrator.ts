/**
 * Workflow Orchestrator - Main service orchestrator
 *
 * Replaces the monolithic WorkflowEngine with a clean service composition.
 * Coordinates between domain services to provide high-level workflow operations.
 */

import { ConfigDiscovery } from '../engine/config-discovery.js';
import { SystemInterface, NodeSystemInterface } from '../engine/system-interface.js';
import { type ProjectConfig } from '../engine/types.js';
import { registerDefaultProcessors } from './processors/index.js';
import { registerDefaultConverters } from './converters/index.js';
import { WorkflowService } from './workflow-service.js';
import { CollectionService } from './collection-service.js';
import { TemplateService } from './template-service.js';
import { ActionService } from './action-service.js';

export interface WorkflowOrchestratorOptions {
  projectRoot?: string;
  configDiscovery?: ConfigDiscovery;
  systemInterface?: SystemInterface;
}

/**
 * Main workflow orchestrator that coordinates domain services
 */
export class WorkflowOrchestrator {
  private systemRoot: string;
  private projectRoot: string;
  private projectConfig: ProjectConfig | null = null;
  private availableWorkflows: string[] = [];
  private configDiscovery: ConfigDiscovery;
  private systemInterface: SystemInterface;

  // Domain services
  private workflowService: WorkflowService;
  private collectionService: CollectionService;
  private templateService: TemplateService;
  private actionService: ActionService;

  constructor(options: WorkflowOrchestratorOptions = {}) {
    this.configDiscovery = options.configDiscovery || new ConfigDiscovery();
    this.systemInterface = options.systemInterface || new NodeSystemInterface();

    const foundSystemRoot = this.configDiscovery.findSystemRoot(
      this.systemInterface.getCurrentFilePath(),
    );
    if (!foundSystemRoot) {
      throw new Error('System root not found. Ensure markdown-workflow is installed.');
    }
    this.systemRoot = foundSystemRoot;
    this.projectRoot = options.projectRoot || this.configDiscovery.requireProjectRoot();

    // Initialize synchronously using system config
    const systemConfig = this.configDiscovery.discoverSystemConfiguration();
    this.availableWorkflows = systemConfig.availableWorkflows;

    // Initialize processors and converters
    registerDefaultProcessors();
    registerDefaultConverters();

    // Initialize domain services
    this.workflowService = new WorkflowService({
      systemRoot: this.systemRoot,
      systemInterface: this.systemInterface,
    });

    this.collectionService = new CollectionService({
      projectRoot: this.projectRoot,
      systemInterface: this.systemInterface,
      configDiscovery: this.configDiscovery,
    });

    this.templateService = new TemplateService({
      systemRoot: this.systemRoot,
      systemInterface: this.systemInterface,
    });

    this.actionService = new ActionService({
      systemRoot: this.systemRoot,
      systemInterface: this.systemInterface,
      templateService: this.templateService,
      workflowService: this.workflowService,
    });
  }

  /**
   * Initialize the workflow orchestrator (async parts)
   */
  private async ensureProjectConfigLoaded(): Promise<void> {
    if (this.projectConfig === null) {
      try {
        const config = await this.configDiscovery.resolveConfiguration(this.projectRoot);
        this.projectConfig = config.projectConfig || null;
      } catch (error) {
        console.error(`🔧 Config resolution failed:`, error);
        this.projectConfig = null;
      }
    }
  }

  /**
   * Load a workflow definition
   */
  async loadWorkflow(workflowName: string) {
    return this.workflowService.loadWorkflowDefinition(workflowName);
  }

  /**
   * Get all collections for a workflow
   */
  async getCollections(workflowName: string) {
    return this.collectionService.getCollections(workflowName);
  }

  /**
   * Get a specific collection by ID
   */
  async getCollection(workflowName: string, collectionId: string) {
    return this.collectionService.getCollection(workflowName, collectionId);
  }

  /**
   * Update collection status with validation
   */
  async updateCollectionStatus(
    workflowName: string,
    collectionId: string,
    newStatus: string,
  ): Promise<void> {
    await this.ensureProjectConfigLoaded();

    const workflow = await this.workflowService.loadWorkflowDefinition(workflowName);
    const collection = await this.collectionService.getCollection(workflowName, collectionId);

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    // Validate status transition
    this.workflowService.validateStatusTransition(workflow, collection.metadata.status, newStatus);

    // Update collection status
    await this.collectionService.updateCollectionStatus(
      collection,
      workflowName,
      newStatus,
      this.projectConfig || undefined,
    );
  }

  /**
   * Execute a workflow action on a collection
   */
  async executeAction(
    workflowName: string,
    collectionId: string,
    actionName: string,
    parameters: Record<string, unknown> = {},
  ): Promise<void> {
    await this.ensureProjectConfigLoaded();

    const workflow = await this.workflowService.loadWorkflowDefinition(workflowName);
    const collection = await this.collectionService.getCollection(workflowName, collectionId);

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    await this.actionService.executeAction(
      workflow,
      collection,
      actionName,
      parameters,
      this.projectConfig || undefined,
    );
  }

  /**
   * Get available workflows
   */
  getAvailableWorkflows(): string[] {
    return this.availableWorkflows;
  }

  /**
   * Get project configuration
   */
  async getProjectConfig(): Promise<ProjectConfig | null> {
    await this.ensureProjectConfigLoaded();
    return this.projectConfig;
  }

  /**
   * Get project root path
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Get system root path
   */
  getSystemRoot(): string {
    return this.systemRoot;
  }

  /**
   * Find collection path by ID within a workflow
   */
  async findCollectionPath(workflowName: string, collectionId: string): Promise<string> {
    const workflow = await this.workflowService.loadWorkflowDefinition(workflowName);
    return this.collectionService.findCollectionPath(workflowName, collectionId, workflow);
  }

  // Expose domain services for advanced use cases
  get services() {
    return {
      workflow: this.workflowService,
      collection: this.collectionService,
      template: this.templateService,
      action: this.actionService,
    };
  }
}
