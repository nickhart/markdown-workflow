/**
 * CLI-specific utilities for command initialization and user interaction
 *
 * This module provides CLI-specific functionality like command parsing helpers,
 * console output utilities, and CLI-specific options handling. Business logic
 * has been moved to ConfigService for sharing with the REST API.
 */

import {
  ConfigService,
  type ProjectContext,
  type WorkflowContext,
} from '../../services/config-service';
import { ConfigDiscovery } from '../../engine/config-discovery';

export interface BaseCliOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

// Re-export types for CLI usage
export type { ProjectContext, WorkflowContext } from '../../services/config-service';

/**
 * Initialize project context using shared ConfigService
 * CLI wrapper around shared business logic
 */
export async function initializeProject(options: BaseCliOptions = {}): Promise<ProjectContext> {
  const configService = new ConfigService({
    cwd: options.cwd,
    configDiscovery: options.configDiscovery,
  });

  return configService.initializeProject(options.cwd);
}

/**
 * Initialize workflow context using shared ConfigService
 * CLI wrapper around shared business logic
 */
export async function initializeWorkflowEngine(
  workflowName: string,
  options: BaseCliOptions = {},
): Promise<WorkflowContext> {
  const configService = new ConfigService({
    cwd: options.cwd,
    configDiscovery: options.configDiscovery,
  });

  return configService.initializeWorkflowEngine(workflowName, options.cwd);
}

/**
 * CLI-specific helper: Parse comma-separated workflow list
 * This is CLI presentation logic, not business logic
 */
export function parseWorkflowList(workflowsOption?: string): string[] | undefined {
  return workflowsOption ? workflowsOption.split(',').map((w: string) => w.trim()) : undefined;
}

/**
 * CLI-specific helper: Validate command arguments
 * This is CLI presentation logic for argument validation
 */
export function validateRequiredArgs(
  args: unknown[],
  requiredCount: number,
  commandName: string,
): void {
  if (args.length < requiredCount) {
    throw new Error(`${commandName} requires at least ${requiredCount} argument(s)`);
  }
}
