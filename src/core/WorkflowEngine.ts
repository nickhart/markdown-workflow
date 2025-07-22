import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import Mustache from 'mustache';
import { ConfigDiscovery } from './ConfigDiscovery.js';
import {
  WorkflowFileSchema,
  type WorkflowFile,
  type ProjectConfig,
  type WorkflowAction,
} from './schemas.js';
import { Collection, type CollectionMetadata } from './types.js';
import { getCurrentISODate, formatDate, getCurrentDate } from '../shared/dateUtils.js';

/**
 * Core workflow engine that manages collections and executes workflow actions
 *
 * This class serves as the main orchestrator for the markdown-workflow system.
 * It handles:
 * - Loading workflow definitions from YAML files
 * - Managing collections (user instances of workflows)
 * - Executing workflow actions like formatting and creating notes
 * - Validating status transitions between workflow stages
 */
export class WorkflowEngine {
  private systemRoot: string;
  private projectRoot: string;
  private projectConfig: ProjectConfig | null = null;
  private availableWorkflows: string[] = [];
  private configDiscovery: ConfigDiscovery;

  constructor(projectRoot?: string, configDiscovery?: ConfigDiscovery) {
    this.configDiscovery = configDiscovery || new ConfigDiscovery();
    const foundSystemRoot = this.configDiscovery.findSystemRoot();
    if (!foundSystemRoot) {
      throw new Error('System root not found. Ensure markdown-workflow is installed.');
    }
    this.systemRoot = foundSystemRoot;
    this.projectRoot = projectRoot || this.configDiscovery.requireProjectRoot();
    this.initializeEngine();
  }

  /**
   * Initialize the workflow engine
   * Loads user configuration and discovers available workflows
   */
  private async initializeEngine(): Promise<void> {
    const config = await this.configDiscovery.resolveConfiguration(this.projectRoot);
    this.projectConfig = config.projectConfig || null;
    this.availableWorkflows = config.availableWorkflows;
  }

  /**
   * Load a workflow definition from YAML file
   * Reads the workflow.yml file from the system workflows directory and validates it
   */
  async loadWorkflow(workflowName: string): Promise<WorkflowFile> {
    const workflowPath = path.join(this.systemRoot, 'workflows', workflowName, 'workflow.yml');

    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow definition not found: ${workflowName}`);
    }

    try {
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      const parsedYaml = YAML.parse(workflowContent);

      const validationResult = WorkflowFileSchema.safeParse(parsedYaml);
      if (!validationResult.success) {
        throw new Error(`Invalid workflow format: ${validationResult.error.message}`);
      }

      return validationResult.data;
    } catch (error) {
      throw new Error(`Failed to load workflow ${workflowName}: ${error}`);
    }
  }

  /**
   * Get all collections for a specific workflow
   * Scans the collections directory and loads metadata for each collection
   */
  async getCollections(workflowName: string): Promise<Collection[]> {
    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
    const workflowCollectionsDir = path.join(projectPaths.collectionsDir, workflowName);

    if (!fs.existsSync(workflowCollectionsDir)) {
      return [];
    }

    const collections: Collection[] = [];
    const collectionDirs = fs
      .readdirSync(workflowCollectionsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const collectionId of collectionDirs) {
      const collectionPath = path.join(workflowCollectionsDir, collectionId);
      const metadataPath = path.join(collectionPath, 'collection.yml');

      if (fs.existsSync(metadataPath)) {
        try {
          const metadataContent = fs.readFileSync(metadataPath, 'utf8');
          const parsedMetadata = YAML.parse(metadataContent);
          const metadata = parsedMetadata as CollectionMetadata;

          const artifacts = this.getCollectionArtifacts(collectionPath);

          collections.push({
            metadata,
            artifacts,
            path: collectionPath,
          });
        } catch (error) {
          console.warn(`Failed to load collection metadata for ${collectionId}:`, error);
        }
      }
    }

    return collections;
  }

  /**
   * Get a specific collection by ID
   */
  async getCollection(workflowName: string, collectionId: string): Promise<Collection | null> {
    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
    const collectionPath = path.join(projectPaths.collectionsDir, workflowName, collectionId);

    if (!fs.existsSync(collectionPath)) {
      return null;
    }

    const metadataPath = path.join(collectionPath, 'collection.yml');
    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    try {
      const metadataContent = fs.readFileSync(metadataPath, 'utf8');
      const parsedMetadata = YAML.parse(metadataContent);
      const metadata = parsedMetadata as CollectionMetadata;
      const artifacts = this.getCollectionArtifacts(collectionPath);

      return {
        metadata,
        artifacts,
        path: collectionPath,
      };
    } catch (error) {
      throw new Error(`Failed to load collection ${collectionId}: ${error}`);
    }
  }

  /**
   * Update collection status with validation
   * Validates that the status transition is allowed by the workflow definition
   */
  async updateCollectionStatus(
    workflowName: string,
    collectionId: string,
    newStatus: string,
  ): Promise<void> {
    const workflow = await this.loadWorkflow(workflowName);
    const collection = await this.getCollection(workflowName, collectionId);

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    const currentStage = workflow.workflow.stages.find(
      (s) => s.name === collection.metadata.status,
    );
    const targetStage = workflow.workflow.stages.find((s) => s.name === newStatus);

    if (!targetStage) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    if (currentStage && currentStage.next && !currentStage.next.includes(newStatus)) {
      throw new Error(`Invalid status transition: ${collection.metadata.status} → ${newStatus}`);
    }

    collection.metadata.status = newStatus;
    collection.metadata.date_modified = getCurrentISODate(this.projectConfig || undefined);
    collection.metadata.status_history.push({
      status: newStatus,
      date: getCurrentISODate(this.projectConfig || undefined),
    });

    const metadataPath = path.join(collection.path, 'collection.yml');
    const metadataContent = YAML.stringify(collection.metadata);
    fs.writeFileSync(metadataPath, metadataContent);
  }

  /**
   * Execute a workflow action on a collection
   * Dispatches to specific action handlers based on action type
   */
  async executeAction(
    workflowName: string,
    collectionId: string,
    actionName: string,
    parameters: Record<string, unknown> = {},
  ): Promise<void> {
    const workflow = await this.loadWorkflow(workflowName);
    const collection = await this.getCollection(workflowName, collectionId);

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    const action = workflow.workflow.actions.find((a) => a.name === actionName);
    if (!action) {
      throw new Error(`Action not found: ${actionName}`);
    }

    // TODO: don't hard-code the action names!
    switch (actionName) {
      case 'format':
        await this.executeFormatAction(workflow, collection, action, parameters);
        break;
      case 'notes':
        await this.executeNotesAction(workflow, collection, action, parameters);
        break;
      default:
        throw new Error(`Action not implemented: ${actionName}`);
    }
  }

  /**
   * Execute format action (convert documents)
   * Converts markdown files in the collection to the specified format
   */
  private async executeFormatAction(
    workflow: WorkflowFile,
    collection: Collection,
    action: WorkflowAction,
    parameters: Record<string, unknown>,
  ): Promise<void> {
    const formatType = parameters.format || 'docx';
    const outputDir = path.join(collection.path, 'formatted');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const markdownFiles = collection.artifacts.filter((file) => file.endsWith('.md'));

    // TODO: allow the user to specify which files to convert (all, or specific ones)
    for (const file of markdownFiles) {
      const inputPath = path.join(collection.path, file);
      const baseName = path.basename(file, '.md');
      const outputPath = path.join(outputDir, `${baseName}.${formatType}`);

      // For now, just copy the file (placeholder for actual conversion)
      // TODO: Implement actual document conversion using pandoc
      console.log(`Converting ${file} to ${formatType}...`);

      if (formatType === 'docx') {
        // Placeholder: In reality, would use pandoc or similar
        fs.copyFileSync(inputPath, outputPath.replace('.docx', '.converted.md'));
        console.log(`Created: ${outputPath}`);
      }
    }
  }

  /**
   * Execute notes action (create notes from template)
   * Creates interview notes or other note types from templates with variable substitution
   */
  private async executeNotesAction(
    workflow: WorkflowFile,
    collection: Collection,
    action: WorkflowAction,
    parameters: Record<string, unknown>,
  ): Promise<void> {
    const noteType = parameters.note_type;
    if (!noteType) {
      throw new Error('note_type parameter is required for notes action');
    }

    const notesTemplate = workflow.workflow.templates.find((t) => t.name === 'interview_notes');
    if (!notesTemplate) {
      throw new Error('Interview notes template not found');
    }

    const templatePath = path.join(
      this.systemRoot,
      'workflows',
      workflow.workflow.name,
      notesTemplate.file,
    );
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');

    const templateVariables = {
      note_type: noteType,
      company: collection.metadata.company,
      role: collection.metadata.role,
      application_name: collection.metadata.collection_id,
      date: formatDate(
        getCurrentDate(this.projectConfig || undefined),
        'YYYY-MM-DD',
        this.projectConfig || undefined,
      ),
      interviewer: parameters.interviewer || '',
      user: this.projectConfig?.user || this.getDefaultUserConfig(),
    };

    const processedContent = Mustache.render(templateContent, templateVariables);
    const outputFile = Mustache.render(notesTemplate.output, templateVariables);
    const outputPath = path.join(collection.path, outputFile);

    fs.writeFileSync(outputPath, processedContent);
    console.log(`Created: ${outputFile}`);
  }

  /**
   * Get artifacts (files) in a collection directory
   * Returns list of non-hidden files in the collection directory
   */
  private getCollectionArtifacts(collectionPath: string): string[] {
    try {
      return fs
        .readdirSync(collectionPath, { withFileTypes: true })
        .filter((dirent) => dirent.isFile() && !dirent.name.startsWith('.')) // Skip hidden files
        .map((dirent) => dirent.name);
    } catch {
      // Return empty array if directory can't be read
      return [];
    }
  }

  /**
   * Get default user configuration
   */
  private getDefaultUserConfig() {
    return {
      name: 'Your Name',
      preferred_name: 'john_doe',
      email: 'your.email@example.com',
      phone: '(555) 123-4567',
      address: '123 Main St',
      city: 'Your City',
      state: 'ST',
      zip: '12345',
      linkedin: 'linkedin.com/in/yourname',
      github: 'github.com/yourusername',
      website: 'yourwebsite.com',
    };
  }

  /**
   * Get available workflows
   */
  getAvailableWorkflows(): string[] {
    return this.availableWorkflows;
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
}

export default WorkflowEngine;
