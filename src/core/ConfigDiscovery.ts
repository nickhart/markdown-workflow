import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ConfigPaths, ResolvedConfig, ProjectConfig } from './types.js';

/**
 * Configuration discovery system for markdown-workflow
 * Implements git-like project discovery and configuration resolution
 */
export class ConfigDiscovery {
  private static readonly PROJECT_MARKER = '.markdown-workflow';
  private static readonly CONFIG_FILE = 'config.yml';

  /**
   * Find the system root (where markdown-workflow is installed)
   */
  static findSystemRoot(): string {
    // For ES modules, use import.meta.url
    const currentFile = fileURLToPath(import.meta.url);
    let currentPath = path.dirname(currentFile);
    
    // Navigate up until we find the root of the markdown-workflow installation
    while (currentPath !== path.parse(currentPath).root) {
      // Look for package.json with our package name
      const packageJsonPath = path.join(currentPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          if (packageJson.name === 'markdown-workflow') {
            return currentPath;
          }
        } catch (error) {
          // Continue searching if package.json is invalid
        }
      }
      currentPath = path.dirname(currentPath);
    }
    
    // Fallback: assume we're in the project structure
    return path.resolve(path.dirname(currentFile), '../..');
  }

  /**
   * Find the project root by walking up from the current directory
   */
  static findProjectRoot(startPath: string = process.cwd()): string | null {
    let currentPath = path.resolve(startPath);
    
    while (currentPath !== path.parse(currentPath).root) {
      const markerPath = path.join(currentPath, this.PROJECT_MARKER);
      if (fs.existsSync(markerPath) && fs.statSync(markerPath).isDirectory()) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }
    
    return null;
  }

  /**
   * Discover configuration paths for the current context
   */
  static discoverConfiguration(cwd: string = process.cwd()): ConfigPaths {
    const systemRoot = this.findSystemRoot();
    const projectRoot = this.findProjectRoot(cwd);
    
    return {
      systemRoot,
      projectRoot,
      projectConfig: projectRoot ? path.join(projectRoot, this.PROJECT_MARKER, this.CONFIG_FILE) : undefined
    };
  }

  /**
   * Load and parse project configuration
   */
  static async loadProjectConfig(configPath: string): Promise<ProjectConfig | null> {
    try {
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const configContent = fs.readFileSync(configPath, 'utf8');
      
      // For now, we'll need to implement YAML parsing
      // This is a placeholder - we'll implement proper YAML parsing in the next step
      console.log('TODO: Implement YAML parsing for config:', configPath);
      
      return null;
    } catch (error) {
      console.error(`Error loading project config from ${configPath}:`, error);
      return null;
    }
  }

  /**
   * Get list of available workflows from system installation
   */
  static getAvailableWorkflows(systemRoot: string): string[] {
    const workflowsPath = path.join(systemRoot, 'workflows');
    
    if (!fs.existsSync(workflowsPath)) {
      return [];
    }

    try {
      return fs.readdirSync(workflowsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    } catch (error) {
      console.error(`Error reading workflows directory ${workflowsPath}:`, error);
      return [];
    }
  }

  /**
   * Resolve complete configuration for the current context
   */
  static async resolveConfiguration(cwd: string = process.cwd()): Promise<ResolvedConfig> {
    const paths = this.discoverConfiguration(cwd);
    const availableWorkflows = this.getAvailableWorkflows(paths.systemRoot);
    
    let projectConfig: ProjectConfig | null = null;
    if (paths.projectConfig) {
      projectConfig = await this.loadProjectConfig(paths.projectConfig);
    }

    return {
      paths,
      projectConfig: projectConfig || undefined,
      availableWorkflows
    };
  }

  /**
   * Check if we're inside a markdown-workflow project
   */
  static isInProject(cwd: string = process.cwd()): boolean {
    return this.findProjectRoot(cwd) !== null;
  }

  /**
   * Get the project root, throwing an error if not in a project
   */
  static requireProjectRoot(cwd: string = process.cwd()): string {
    const projectRoot = this.findProjectRoot(cwd);
    if (!projectRoot) {
      throw new Error(
        'Not in a markdown-workflow project. Run "wf-init" to initialize a project.'
      );
    }
    return projectRoot;
  }

  /**
   * Get paths for project structure
   */
  static getProjectPaths(projectRoot: string) {
    const projectDir = path.join(projectRoot, this.PROJECT_MARKER);
    
    return {
      projectDir,
      configFile: path.join(projectDir, this.CONFIG_FILE),
      workflowsDir: path.join(projectDir, 'workflows'),
      collectionsDir: path.join(projectDir, 'collections')
    };
  }
}