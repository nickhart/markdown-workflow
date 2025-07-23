import * as path from 'path';
import * as YAML from 'yaml';
import Mustache from 'mustache';
import { ConfigDiscovery } from './ConfigDiscovery.js';
import { SystemInterface, NodeSystemInterface } from './SystemInterface.js';
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
  private systemInterface: SystemInterface;

  constructor(
    projectRoot?: string,
    configDiscovery?: ConfigDiscovery,
    systemInterface?: SystemInterface,
  ) {
    this.configDiscovery = configDiscovery || new ConfigDiscovery();
    this.systemInterface = systemInterface || new NodeSystemInterface();
    const foundSystemRoot = this.configDiscovery.findSystemRoot(
      this.systemInterface.getCurrentFilePath(),
    );
    if (!foundSystemRoot) {
      throw new Error('System root not found. Ensure markdown-workflow is installed.');
    }
    this.systemRoot = foundSystemRoot;
    this.projectRoot = projectRoot || this.configDiscovery.requireProjectRoot();

    // Initialize synchronously using system config
    const systemConfig = this.configDiscovery.discoverSystemConfiguration();
    this.availableWorkflows = systemConfig.availableWorkflows;
  }

  /**
   * Initialize the workflow engine (async parts)
   * Loads user configuration - should be called when project config is needed
   */
  private async ensureProjectConfigLoaded(): Promise<void> {
    if (this.projectConfig === null) {
      const config = await this.configDiscovery.resolveConfiguration(this.projectRoot);
      this.projectConfig = config.projectConfig || null;
    }
  }

  /**
   * Load a workflow definition from YAML file
   * Reads the workflow.yml file from the system workflows directory and validates it
   */
  async loadWorkflow(workflowName: string): Promise<WorkflowFile> {
    const workflowPath = path.join(this.systemRoot, 'workflows', workflowName, 'workflow.yml');

    if (!this.systemInterface.existsSync(workflowPath)) {
      throw new Error(`Workflow definition not found: ${workflowName}`);
    }

    try {
      const workflowContent = this.systemInterface.readFileSync(workflowPath);
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

    if (!this.systemInterface.existsSync(workflowCollectionsDir)) {
      return [];
    }

    const collections: Collection[] = [];

    // Scan through status directories (active, submitted, interview, etc.)
    const statusDirs = this.systemInterface
      .readdirSync(workflowCollectionsDir)
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const statusDir of statusDirs) {
      const statusPath = path.join(workflowCollectionsDir, statusDir);

      // Get collections within this status directory
      const collectionDirs = this.systemInterface
        .readdirSync(statusPath)
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const collectionId of collectionDirs) {
        const collectionPath = path.join(statusPath, collectionId);
        const metadataPath = path.join(collectionPath, 'collection.yml');

        if (this.systemInterface.existsSync(metadataPath)) {
          try {
            const metadataContent = this.systemInterface.readFileSync(metadataPath);
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
    }

    return collections;
  }

  /**
   * Get a specific collection by ID
   */
  async getCollection(workflowName: string, collectionId: string): Promise<Collection | null> {
    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
    const workflowCollectionsDir = path.join(projectPaths.collectionsDir, workflowName);

    if (!this.systemInterface.existsSync(workflowCollectionsDir)) {
      return null;
    }

    // Search through all status directories to find the collection
    const statusDirs = this.systemInterface
      .readdirSync(workflowCollectionsDir)
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const statusDir of statusDirs) {
      const collectionPath = path.join(workflowCollectionsDir, statusDir, collectionId);
      const metadataPath = path.join(collectionPath, 'collection.yml');

      if (this.systemInterface.existsSync(metadataPath)) {
        try {
          const metadataContent = this.systemInterface.readFileSync(metadataPath);
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
    }

    return null;
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
    await this.ensureProjectConfigLoaded();

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

    const oldStatus = collection.metadata.status;

    // Update metadata
    collection.metadata.status = newStatus;
    collection.metadata.date_modified = getCurrentISODate(this.projectConfig || undefined);
    collection.metadata.status_history.push({
      status: newStatus,
      date: getCurrentISODate(this.projectConfig || undefined),
    });

    // If status actually changed, move the collection directory
    if (oldStatus !== newStatus) {
      const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
      const oldPath = collection.path;
      const newPath = path.join(projectPaths.collectionsDir, workflowName, newStatus, collectionId);

      // Create new status directory if it doesn't exist
      const newStatusDir = path.dirname(newPath);
      if (!this.systemInterface.existsSync(newStatusDir)) {
        this.systemInterface.mkdirSync(newStatusDir, { recursive: true });
      }

      // Move the collection directory
      this.systemInterface.renameSync(oldPath, newPath);

      // Update collection path reference
      collection.path = newPath;
    }

    // Write updated metadata to the (possibly new) location
    const metadataPath = path.join(collection.path, 'collection.yml');
    const metadataContent = YAML.stringify(collection.metadata);
    this.systemInterface.writeFileSync(metadataPath, metadataContent);
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
    const requestedArtifacts = parameters.artifacts as string[] | undefined;
    const outputDir = path.join(collection.path, 'formatted');

    if (!this.systemInterface.existsSync(outputDir)) {
      this.systemInterface.mkdirSync(outputDir, { recursive: true });
    }

    // Get all markdown files in collection
    const markdownFiles = collection.artifacts.filter((file) => file.endsWith('.md'));

    // Filter files based on requested artifacts (template names)
    let filesToConvert = markdownFiles;

    if (requestedArtifacts && requestedArtifacts.length > 0) {
      // Map template names to their expected output files
      const templateToFileMap = await this.getTemplateArtifactMap(workflow, collection);

      // Filter to only requested artifacts
      const requestedFiles = new Set<string>();
      for (const artifact of requestedArtifacts) {
        const files = templateToFileMap.get(artifact);
        if (files) {
          files.forEach((file) => requestedFiles.add(file));
        } else {
          console.warn(
            `Warning: Unknown artifact '${artifact}'. Available artifacts: ${Array.from(templateToFileMap.keys()).join(', ')}`,
          );
        }
      }

      filesToConvert = markdownFiles.filter((file) => requestedFiles.has(file));

      if (filesToConvert.length === 0) {
        throw new Error(`No files found for requested artifacts: ${requestedArtifacts.join(', ')}`);
      }
    }

    // Convert the filtered files
    for (const file of filesToConvert) {
      const inputPath = path.join(collection.path, file);
      const baseName = path.basename(file, '.md');
      const outputPath = path.join(outputDir, `${baseName}.${formatType}`);

      // For now, just copy the file (placeholder for actual conversion)
      // TODO: Implement actual document conversion using pandoc
      console.log(`Converting ${file} to ${formatType}...`);

      if (formatType === 'docx') {
        // Placeholder: In reality, would use pandoc or similar
        this.systemInterface.copyFileSync(inputPath, outputPath.replace('.docx', '.converted.md'));
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
    await this.ensureProjectConfigLoaded();

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
    if (!this.systemInterface.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const templateContent = this.systemInterface.readFileSync(templatePath);

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

    this.systemInterface.writeFileSync(outputPath, processedContent);
    console.log(`Created: ${outputFile}`);
  }

  /**
   * Get artifacts (files) in a collection directory
   * Returns list of non-hidden files in the collection directory
   */
  private getCollectionArtifacts(collectionPath: string): string[] {
    try {
      return this.systemInterface
        .readdirSync(collectionPath)
        .filter((dirent) => dirent.isFile() && !dirent.name.startsWith('.')) // Skip hidden files
        .map((dirent) => dirent.name);
    } catch {
      // Return empty array if directory can't be read
      return [];
    }
  }

  /**
   * Map template names to their output artifact files in a collection
   * This allows users to reference artifacts by their template names (e.g., "resume", "cover_letter")
   */
  private async getTemplateArtifactMap(
    workflow: WorkflowFile,
    collection: Collection,
  ): Promise<Map<string, string[]>> {
    await this.ensureProjectConfigLoaded();
    const templateMap = new Map<string, string[]>();

    // For each template in the workflow, resolve its output filename
    for (const template of workflow.workflow.templates) {
      // Template variables are used in the pattern matching logic below
      const _templateVariables = {
        user: this.projectConfig?.user || this.getDefaultUserConfig(),
        company: collection.metadata.company,
        role: collection.metadata.role,
        application_name: collection.metadata.collection_id,
        date: formatDate(
          getCurrentDate(this.projectConfig || undefined),
          'YYYY-MM-DD',
          this.projectConfig || undefined,
        ),
        // Add any other variables that might be used in output patterns
        note_type: '{{note_type}}', // Placeholder for dynamic templates
      };

      try {
        // Find all collection artifacts that match this template pattern
        const matchingFiles = collection.artifacts.filter((artifact) => {
          // For dynamic templates (like notes), we need pattern matching
          if (template.output.includes('{{note_type}}')) {
            // Match any file that could have been generated from this template
            const basePattern = template.output.replace('{{note_type}}', '(.+)');
            const regex = new RegExp(
              basePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\(\\.\\+\\)', '(.+)'),
            );
            return regex.test(artifact);
          } else {
            // For user variable templates, match the pattern more flexibly
            let pattern = template.output;

            // Replace user variables with wildcards for matching
            pattern = pattern.replace(/\{\{user\.preferred_name\}\}/g, '(.+)');
            pattern = pattern.replace(/\{\{user\.name\}\}/g, '(.+)');

            // Create regex from pattern
            const regex = new RegExp(
              '^' +
                pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\(\\.\\+\\)', '(.+)') +
                '$',
            );
            return regex.test(artifact);
          }
        });

        if (matchingFiles.length > 0) {
          templateMap.set(template.name, matchingFiles);
        }
      } catch (error) {
        console.warn(`Warning: Could not resolve output for template ${template.name}:`, error);
      }
    }

    return templateMap;
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
