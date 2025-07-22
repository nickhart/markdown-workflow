import * as path from 'path';
import * as YAML from 'yaml';
import { ConfigPaths, ResolvedConfig } from './types.js';
import { ProjectConfigSchema, type ProjectConfig } from './schemas.js';
import { SystemInterface, NodeSystemInterface } from './SystemInterface.js';

/**
 * Configuration discovery system for markdown-workflow
 * Implements git-like project discovery and configuration resolution
 *
 * This class handles finding:
 * - System root (where markdown-workflow is installed)
 * - Project root (user's working directory with .markdown-workflow marker)
 * - Configuration files and validation
 * - Available workflows in the system
 */
export class ConfigDiscovery {
  private systemInterface: SystemInterface;

  constructor(systemInterface: SystemInterface = new NodeSystemInterface()) {
    this.systemInterface = systemInterface;
  }

  // constants for the project structure
  private static readonly PROJECT_MARKER = '.markdown-workflow';
  private static readonly CONFIG_FILE = 'config.yml';

  /**
   * Find the system root (where markdown-workflow is installed)
   * Traverses up from current file location to find package.json.
   * If called from outside a markdown-workflow project, it will throw an error.
   */
  findSystemRoot(startPath: string = process.cwd()): string | null {
    let currentPath = path.resolve(startPath);

    while (currentPath !== path.parse(currentPath).root) {
      const packageJsonPath = path.join(currentPath, 'package.json');
      if (this.systemInterface.existsSync(packageJsonPath)) {
        try {
          const packageJsonContent = this.systemInterface.readFileSync(packageJsonPath);
          const packageJson = JSON.parse(packageJsonContent);
          if (packageJson.name === 'markdown-workflow') {
            return currentPath;
          }
        } catch {
          // Continue searching if package.json is invalid JSON
        }
      }
      currentPath = path.dirname(currentPath); // parent directory
    }

    return null;
  }

  /**
   * Find the project root by walking up from the current directory
   * Searches for .markdown-workflow directory (like git searches for .git)
   */
  findProjectRoot(startPath: string = process.cwd()): string | null {
    // Start from the specified path (defaults to current working directory)
    let currentPath = path.resolve(startPath);

    // Walk up the directory tree until we reach the filesystem root
    while (currentPath !== path.parse(currentPath).root) {
      // Check if this directory contains the project marker
      const markerPath = path.join(currentPath, ConfigDiscovery.PROJECT_MARKER);
      if (
        this.systemInterface.existsSync(markerPath) &&
        this.systemInterface.statSync(markerPath).isDirectory()
      ) {
        // Found the project root - return this directory
        return currentPath;
      }
      // Move up one directory level
      currentPath = path.dirname(currentPath);
    }

    // No project root found
    return null;
  }

  /**
   * Discover configuration paths for the current context
   * Combines system root discovery with project root discovery to build paths
   */
  discoverConfiguration(cwd: string = process.cwd()): ConfigPaths {
    // Find where markdown-workflow is installed (system)
    const systemRoot = this.findSystemRoot(this.systemInterface.getCurrentFilePath());
    if (!systemRoot) {
      throw new Error('System root not found. Ensure markdown-workflow is installed.');
    }

    // Find the user's project root (if we're in a project)
    const projectRoot = this.findProjectRoot(cwd);
    if (!projectRoot) {
      throw new Error('Project root not found. Ensure you are in a markdown-workflow project.');
    }

    return {
      systemRoot,
      projectRoot,
      // Build path to config file
      projectConfig: path.join(projectRoot, ConfigDiscovery.PROJECT_MARKER, ConfigDiscovery.CONFIG_FILE),
    };
  }

  /**
   * Discover system configuration without requiring a project context
   * Used by commands like init that need to work outside of project directories
   */
  discoverSystemConfiguration(): { systemRoot: string; availableWorkflows: string[] } {
    // Find where markdown-workflow is installed (system)
    const systemRoot = this.findSystemRoot(this.systemInterface.getCurrentFilePath());
    if (!systemRoot) {
      throw new Error('System root not found. Ensure markdown-workflow is installed.');
    }

    // Get available workflows from system
    const availableWorkflows = this.getAvailableWorkflows(systemRoot);

    return {
      systemRoot,
      availableWorkflows,
    };
  }

  /**
   * Load and parse project configuration with Zod validation
   * Reads config.yml from the project and validates its structure
   */
  async loadProjectConfig(configPath: string): Promise<ProjectConfig | null> {
    try {
      // Check if config file exists
      if (!this.systemInterface.existsSync(configPath)) {
        return null;
      }

      // Read and parse the YAML configuration
      const configContent = this.systemInterface.readFileSync(configPath);
      const parsedYaml = YAML.parse(configContent);

      // Validate the configuration structure using Zod schema
      const validationResult = ProjectConfigSchema.safeParse(parsedYaml);

      if (!validationResult.success) {
        throw new Error(`Invalid configuration format: ${validationResult.error.message}`);
      }

      // Return the validated configuration
      return validationResult.data;
    } catch (error) {
      // Log error but don't throw - allows system to continue with defaults
      console.error(`Error loading project config from ${configPath}:`, error);
      return null;
    }
  }

  /**
   * Get list of available workflows from system installation
   * Scans the workflows directory for subdirectories (each is a workflow)
   */
  getAvailableWorkflows(systemRoot: string): string[] {
    // Build path to workflows directory in system installation
    const workflowsPath = path.join(systemRoot, 'workflows');

    // Return empty array if workflows directory doesn't exist
    if (!this.systemInterface.existsSync(workflowsPath)) {
      return [];
    }

    try {
      // Read directory contents and filter for subdirectories only
      return this.systemInterface
        .readdirSync(workflowsPath)
        .filter((dirent) => dirent.isDirectory()) // Only include directories
        .map((dirent) => dirent.name); // Extract directory names
    } catch (error) {
      // Log error but return empty array to allow system to continue
      console.error(`Error reading workflows directory ${workflowsPath}:`, error);
      return [];
    }
  }

  /**
   * Resolve complete configuration for the current context
   * Combines all configuration discovery into a single result
   */
  async resolveConfiguration(cwd: string = process.cwd()): Promise<ResolvedConfig> {
    // Discover system and project paths
    const paths = this.discoverConfiguration(cwd);
    // Get list of available workflows from system
    const availableWorkflows = this.getAvailableWorkflows(paths.systemRoot);

    // Load project configuration if we're in a project
    let projectConfig: ProjectConfig | null = null;
    if (paths.projectConfig) {
      projectConfig = await this.loadProjectConfig(paths.projectConfig);
    }

    // Return combined configuration
    return {
      paths,
      projectConfig: projectConfig || undefined,
      availableWorkflows,
    };
  }

  /**
   * Check if we're inside a markdown-workflow project
   * Simple boolean check for project existence
   */
  isInProject(cwd: string = process.cwd()): boolean {
    return this.findProjectRoot(cwd) !== null;
  }

  /**
   * Get the project root, throwing an error if not in a project
   * Used when project context is required (throws if not in project)
   */
  requireProjectRoot(cwd: string = process.cwd()): string {
    const projectRoot = this.findProjectRoot(cwd);
    if (!projectRoot) {
      throw new Error('Not in a markdown-workflow project. Run "wf-init" to initialize a project.');
    }
    return projectRoot;
  }

  /**
   * Get paths for project structure
   * Builds standard paths within a project directory
   */
  getProjectPaths(projectRoot: string) {
    // The .markdown-workflow directory contains all project files
    const projectDir = path.join(projectRoot, ConfigDiscovery.PROJECT_MARKER);

    return {
      projectDir, // .markdown-workflow/
      configFile: path.join(projectDir, ConfigDiscovery.CONFIG_FILE), // .markdown-workflow/config.yml
      workflowsDir: path.join(projectDir, 'workflows'), // .markdown-workflow/workflows/
      collectionsDir: path.join(projectDir, 'collections'), // .markdown-workflow/collections/
    };
  }
}
