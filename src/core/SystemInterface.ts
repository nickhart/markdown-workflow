import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Interface for system operations used by ConfigDiscovery
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
   * Get file/directory stats
   */
  statSync(path: string): fs.Stats;

  /**
   * Read directory contents with file type information
   */
  readdirSync(path: string): fs.Dirent[];
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

  statSync(path: string): fs.Stats {
    return fs.statSync(path);
  }

  readdirSync(path: string): fs.Dirent[] {
    return fs.readdirSync(path, { withFileTypes: true });
  }
}
