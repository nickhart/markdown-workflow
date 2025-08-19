/**
 * Shared error handling utilities for CLI commands
 */

import { logError } from './console-output';

/**
 * Standard CLI error handler - logs error and exits with code 1
 * Extracts error message if Error object, otherwise converts to string
 */
export function handleCliError(error: unknown): never {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/**
 * Wraps an async CLI command function with standard error handling
 * Usage: .action(withErrorHandling(async (options) => { ... }))
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await fn(...args);
    } catch (error) {
      handleCliError(error);
    }
  };
}
