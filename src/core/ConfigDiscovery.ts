import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as YAML from 'yaml';
import { ConfigPaths, ResolvedConfig } from './types.js';
import { ProjectConfigSchema, type ProjectConfig } from './schemas.js';

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
  // Directory name that marks a markdown-workflow project (like .git)
  private static readonly PROJECT_MARKER = '.markdown-workflow';
  // Configuration file name within the project marker directory
  private static readonly CONFIG_FILE = 'config.yml';

  /**
   * Find the system root (where markdown-workflow is installed)
   * Works in both ES modules and CommonJS, traverses up to find package.json
   */
  static findSystemRoot(): string {
    // For ES modules, use import.meta.url when available
    let currentPath: string;

    try {
      // This will work in ES modules - convert file URL to path
      const currentFile = fileURLToPath(import.meta.url);
      currentPath = path.dirname(currentFile);
    } catch {
      // Fallback for testing or CommonJS environments
      currentPath = path.resolve(__dirname);
    }

    // Navigate up the directory tree until we find the root of the markdown-workflow installation
    while (currentPath !== path.parse(currentPath).root) {
      // Look for package.json with our package name
      const packageJsonPath = path.join(currentPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          // Check if this is the markdown-workflow package
          if (packageJson.name === 'markdown-workflow') {
            return currentPath;
          }
        } catch {
          // Continue searching if package.json is invalid JSON
        }
      }
      // Move up one directory level
      currentPath = path.dirname(currentPath);
    }

    // Fallback: assume we're in the project structure
    return path.resolve(currentPath, '../..');
  }

  /**
   * Find the project root by walking up from the current directory
   * Searches for .markdown-workflow directory (like git searches for .git)
   */
  static findProjectRoot(startPath: string = process.cwd()): string | null {
    // Start from the specified path (defaults to current working directory)
    let currentPath = path.resolve(startPath);

    // Walk up the directory tree until we reach the filesystem root
    while (currentPath !== path.parse(currentPath).root) {
      // Check if this directory contains the project marker
      const markerPath = path.join(currentPath, this.PROJECT_MARKER);
      if (fs.existsSync(markerPath) && fs.statSync(markerPath).isDirectory()) {
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
  static discoverConfiguration(cwd: string = process.cwd()): ConfigPaths {
    // Find where markdown-workflow is installed (system)
    const systemRoot = this.findSystemRoot();
    // Find the user's project root (if we're in a project)
    const projectRoot = this.findProjectRoot(cwd);

    return {
      systemRoot,
      projectRoot,
      // If we're in a project, build path to config file
      projectConfig: projectRoot
        ? path.join(projectRoot, this.PROJECT_MARKER, this.CONFIG_FILE)
        : undefined,
    };
  }

  /**
   * Load and parse project configuration with Zod validation
   * Reads config.yml from the project and validates its structure
   */
  static async loadProjectConfig(configPath: string): Promise<ProjectConfig | null> {
    try {
      // Check if config file exists
      if (!fs.existsSync(configPath)) {
        return null;
      }

      // Read and parse the YAML configuration
      const configContent = fs.readFileSync(configPath, 'utf8');
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
  static getAvailableWorkflows(systemRoot: string): string[] {
    // Build path to workflows directory in system installation
    const workflowsPath = path.join(systemRoot, 'workflows');

    // Return empty array if workflows directory doesn't exist
    if (!fs.existsSync(workflowsPath)) {
      return [];
    }

    try {
      // Read directory contents and filter for subdirectories only
      return fs
        .readdirSync(workflowsPath, { withFileTypes: true })
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
  static async resolveConfiguration(cwd: string = process.cwd()): Promise<ResolvedConfig> {
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
  static isInProject(cwd: string = process.cwd()): boolean {
    return this.findProjectRoot(cwd) !== null;
  }

  /**
   * Get the project root, throwing an error if not in a project
   * Used when project context is required (throws if not in project)
   */
  static requireProjectRoot(cwd: string = process.cwd()): string {
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
  static getProjectPaths(projectRoot: string) {
    // The .markdown-workflow directory contains all project files
    const projectDir = path.join(projectRoot, this.PROJECT_MARKER);

    return {
      projectDir, // .markdown-workflow/
      configFile: path.join(projectDir, this.CONFIG_FILE), // .markdown-workflow/config.yml
      workflowsDir: path.join(projectDir, 'workflows'), // .markdown-workflow/workflows/
      collectionsDir: path.join(projectDir, 'collections'), // .markdown-workflow/collections/
    };
  }
}
