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

/**
 * Core workflow engine that manages collections and executes workflow actions
 */
export class WorkflowEngine {
  private systemRoot: string;
  private projectRoot: string;
  private projectConfig: ProjectConfig | null = null;
  private availableWorkflows: string[] = [];

  constructor(projectRoot?: string) {
    this.systemRoot = ConfigDiscovery.findSystemRoot();
    this.projectRoot = projectRoot || ConfigDiscovery.requireProjectRoot();
    this.initializeEngine();
  }

  /**
   * Initialize the workflow engine
   */
  private async initializeEngine(): Promise<void> {
    const config = await ConfigDiscovery.resolveConfiguration(this.projectRoot);
    this.projectConfig = config.projectConfig || null;
    this.availableWorkflows = config.availableWorkflows;
  }

  /**
   * Load a workflow definition from YAML file
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
   */
  async getCollections(workflowName: string): Promise<Collection[]> {
    const projectPaths = ConfigDiscovery.getProjectPaths(this.projectRoot);
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
    const projectPaths = ConfigDiscovery.getProjectPaths(this.projectRoot);
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

    // Validate status transition
    const currentStage = workflow.workflow.stages.find(
      (s) => s.name === collection.metadata.status,
    );
    const targetStage = workflow.workflow.stages.find((s) => s.name === newStatus);

    if (!targetStage) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    if (currentStage && currentStage.next && !currentStage.next.includes(newStatus)) {
      throw new Error(`Invalid status transition: ${collection.metadata.status} � ${newStatus}`);
    }

    // Update metadata
    collection.metadata.status = newStatus;
    collection.metadata.date_modified = new Date().toISOString();
    collection.metadata.status_history.push({
      status: newStatus,
      date: new Date().toISOString(),
    });

    // Save updated metadata
    const metadataPath = path.join(collection.path, 'collection.yml');
    const metadataContent = YAML.stringify(collection.metadata);
    fs.writeFileSync(metadataPath, metadataContent);
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
    const workflow = await this.loadWorkflow(workflowName);
    const collection = await this.getCollection(workflowName, collectionId);

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    const action = workflow.workflow.actions.find((a) => a.name === actionName);
    if (!action) {
      throw new Error(`Action not found: ${actionName}`);
    }

    // Execute action based on its type
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
   */
  private async executeFormatAction(
    workflow: WorkflowFile,
    collection: Collection,
    action: WorkflowAction,
    parameters: Record<string, unknown>,
  ): Promise<void> {
    const formatType = parameters.format || 'docx';
    const outputDir = path.join(collection.path, 'formatted');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Find markdown files to convert
    const markdownFiles = collection.artifacts.filter((file) => file.endsWith('.md'));

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

    // Process template with variables
    const templateVariables = {
      note_type: noteType,
      company: collection.metadata.company,
      role: collection.metadata.role,
      application_name: collection.metadata.collection_id,
      date: new Date().toISOString().slice(0, 10),
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
   */
  private getCollectionArtifacts(collectionPath: string): string[] {
    try {
      return fs
        .readdirSync(collectionPath, { withFileTypes: true })
        .filter((dirent) => dirent.isFile() && !dirent.name.startsWith('.'))
        .map((dirent) => dirent.name);
    } catch {
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
