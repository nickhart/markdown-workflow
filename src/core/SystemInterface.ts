import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Interface for system operations used by ConfigDiscovery and WorkflowEngine
 * Allows for dependency injection and easier testing
 */
export interface SystemInterface {
  /**
   * Get the current file path for system root discovery
   */
  getCurrentFilePath(): string;

  /**
   * Check if a file exists at the given path
   */
  existsSync(path: string): boolean;

  /**
   * Read a file synchronously as UTF-8 string
   */
  readFileSync(path: string): string;

  /**
   * Write a file synchronously with UTF-8 encoding
   */
  writeFileSync(path: string, data: string): void;

  /**
   * Get file/directory stats
   */
  statSync(path: string): fs.Stats;

  /**
   * Read directory contents with file type information
   */
  readdirSync(path: string): fs.Dirent[];

  /**
   * Create a directory (and parent directories if needed)
   */
  mkdirSync(path: string, options?: { recursive?: boolean }): void;

  /**
   * Rename/move a file or directory
   */
  renameSync(oldPath: string, newPath: string): void;

  /**
   * Copy a file
   */
  copyFileSync(src: string, dest: string): void;

  /**
   * Delete a file
   */
  unlinkSync(path: string): void;

  /**
   * Remove a directory
   */
  rmdirSync(path: string): void;
}

/**
 * Production implementation of SystemInterface using Node.js fs module
 */
export class NodeSystemInterface implements SystemInterface {
  getCurrentFilePath(): string {
    // For ES modules, use import.meta.url when available
    try {
      // This will work in ES modules - convert file URL to path
      const currentFile = fileURLToPath(import.meta.url);
      return path.dirname(currentFile);
    } catch {
      // Fallback for testing or CommonJS environments
      return path.resolve(__dirname);
    }
  }

  existsSync(path: string): boolean {
    return fs.existsSync(path);
  }

  readFileSync(path: string): string {
    return fs.readFileSync(path, 'utf8');
  }

  writeFileSync(path: string, data: string): void {
    fs.writeFileSync(path, data, 'utf8');
  }

  statSync(path: string): fs.Stats {
    return fs.statSync(path);
  }

  readdirSync(path: string): fs.Dirent[] {
    return fs.readdirSync(path, { withFileTypes: true });
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    fs.mkdirSync(path, options);
  }

  renameSync(oldPath: string, newPath: string): void {
    fs.renameSync(oldPath, newPath);
  }

  copyFileSync(src: string, dest: string): void {
    fs.copyFileSync(src, dest);
  }

  unlinkSync(path: string): void {
    fs.unlinkSync(path);
  }

  rmdirSync(path: string): void {
    fs.rmdirSync(path);
  }
}
