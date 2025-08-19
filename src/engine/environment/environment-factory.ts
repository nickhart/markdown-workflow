/**
 * Environment Factory - Helper functions for creating Environment instances
 *
 * Provides convenient factory methods for creating different types of environments
 * and common combinations used throughout the system.
 */

import * as path from 'path';
import { Environment } from './environment.js';
import { FilesystemEnvironment } from './filesystem-environment.js';
import { MemoryEnvironment, MemoryEnvironmentData } from './memory-environment.js';
import { MergedEnvironment } from './merged-environment.js';
import { WorkflowContext, createWorkflowContext } from './workflow-context.js';
import { SecurityConfig, DEFAULT_SECURITY_CONFIG } from './security-validator.js';
import { SystemInterface, NodeSystemInterface } from '../system-interface.js';

export interface EnvironmentFactoryOptions {
  systemInterface?: SystemInterface;
  securityConfig?: SecurityConfig;
}

export class EnvironmentFactory {
  private systemInterface: SystemInterface;
  private securityConfig: SecurityConfig;

  constructor(options: EnvironmentFactoryOptions = {}) {
    this.systemInterface = options.systemInterface || new NodeSystemInterface();
    this.securityConfig = options.securityConfig || DEFAULT_SECURITY_CONFIG;
  }

  /**
   * Create a filesystem environment
   */
  createFilesystemEnvironment(rootPath: string): FilesystemEnvironment {
    return new FilesystemEnvironment(rootPath, this.systemInterface, this.securityConfig);
  }

  /**
   * Create a memory environment
   */
  createMemoryEnvironment(initialData?: Partial<MemoryEnvironmentData>): MemoryEnvironment {
    return new MemoryEnvironment(initialData);
  }

  /**
   * Create a merged environment
   */
  createMergedEnvironment(localEnv: Environment, globalEnv: Environment): MergedEnvironment {
    return new MergedEnvironment(localEnv, globalEnv);
  }

  /**
   * Create a workflow context
   */
  createWorkflowContext(environment: Environment, workflowName: string): WorkflowContext {
    return createWorkflowContext(environment, workflowName);
  }

  /**
   * Create standard CLI environment (local + global filesystem)
   */
  createCLIEnvironment(projectRoot: string, systemRoot: string): MergedEnvironment {
    const localEnv = this.createFilesystemEnvironment(path.join(projectRoot, '.markdown-workflow'));
    const globalEnv = this.createFilesystemEnvironment(systemRoot);

    return this.createMergedEnvironment(localEnv, globalEnv);
  }

  /**
   * Create testing environment with mock data
   */
  createTestEnvironment(mockData?: Partial<MemoryEnvironmentData>): MemoryEnvironment {
    return this.createMemoryEnvironment(mockData);
  }

  /**
   * Create environment for specific workflow with lazy loading
   */
  async createWorkflowEnvironment(
    projectRoot: string,
    systemRoot: string,
    workflowName: string,
  ): Promise<{
    environment: MergedEnvironment;
    context: WorkflowContext;
  }> {
    const environment = this.createCLIEnvironment(projectRoot, systemRoot);
    const context = this.createWorkflowContext(environment, workflowName);

    // Verify workflow exists
    if (!(await environment.hasWorkflow(workflowName))) {
      const availableWorkflows = await environment.listWorkflows();
      throw new Error(
        `Workflow '${workflowName}' not found. Available workflows: ${availableWorkflows.join(', ')}`,
      );
    }

    return { environment, context };
  }

  /**
   * Create environment from system discovery (git-like discovery)
   */
  async createFromDiscovery(startPath: string = process.cwd()): Promise<{
    environment: MergedEnvironment;
    projectRoot: string;
    systemRoot: string;
  }> {
    // Use existing config discovery to find roots
    const { ConfigDiscovery } = await import('../config-discovery.js');
    const discovery = new ConfigDiscovery(this.systemInterface);

    const systemRoot = discovery.findSystemRoot();
    if (!systemRoot) {
      throw new Error('System root not found. Ensure markdown-workflow is installed.');
    }

    const projectRoot = discovery.findProjectRoot(startPath);
    if (!projectRoot) {
      throw new Error('Project root not found. Run `wf init` to initialize a project.');
    }

    const environment = this.createCLIEnvironment(projectRoot, systemRoot);

    return {
      environment,
      projectRoot,
      systemRoot,
    };
  }

  /**
   * Validate environment setup
   */
  async validateEnvironment(environment: Environment): Promise<{
    isValid: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for basic functionality
      const manifest = await environment.getManifest();

      if (manifest.workflows.length === 0) {
        warnings.push('No workflows found');
      }

      // Check if we can load each workflow
      for (const workflowName of manifest.workflows) {
        try {
          await environment.getWorkflow(workflowName);
        } catch (error) {
          issues.push(`Failed to load workflow '${workflowName}': ${error}`);
        }
      }

      // Check configuration
      try {
        await environment.getConfig();
      } catch (error) {
        warnings.push(`Configuration issues: ${error}`);
      }
    } catch (error) {
      issues.push(`Environment validation failed: ${error}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
    };
  }
}

/**
 * Default factory instance
 */
export const environmentFactory = new EnvironmentFactory();

/**
 * Convenience functions using default factory
 */
export const createFilesystemEnvironment = (rootPath: string) =>
  environmentFactory.createFilesystemEnvironment(rootPath);

export const createMemoryEnvironment = (initialData?: Partial<MemoryEnvironmentData>) =>
  environmentFactory.createMemoryEnvironment(initialData);

export const createMergedEnvironment = (localEnv: Environment, globalEnv: Environment) =>
  environmentFactory.createMergedEnvironment(localEnv, globalEnv);

export const createCLIEnvironment = (projectRoot: string, systemRoot: string) =>
  environmentFactory.createCLIEnvironment(projectRoot, systemRoot);

export const createTestEnvironment = (mockData?: Partial<MemoryEnvironmentData>) =>
  environmentFactory.createTestEnvironment(mockData);

export const createFromDiscovery = (startPath?: string) =>
  environmentFactory.createFromDiscovery(startPath);
