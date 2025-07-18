import * as fs from 'fs';
import { SystemInterface } from '../../src/core/SystemInterface'

type FileSystemContent = {
  name: string;
  dirs: FileSystemContent[];
  files: string[];
}

const exampleFileSystemContent = {
  name: 'mock/system/root',
  dirs: [
    {
      name: 'workflows',
      dirs: [
        { name: 'job', dirs: [], files: ['job.md'] },
        { name: 'blog', dirs: [], files: ['blog.md'] }
      ],
      files: []
    },
    { name: 'collections', dirs: [], files: [] }
  ],
  files: ['package.json']
};

/**
 * Mock implementation of SystemInterface for testing
 */
export class MockSystemInterface implements SystemInterface {
  private mockCurrentPath: string;
  private mockFiles: Map<string, string>;
  private mockDirectories: Set<string>;
  private mockStats: Map<string, fs.Stats>;

  constructor(
    currentPath: string = '/mock/system/root',
    files: Record<string, string> = {},
    directories: string[] = []
  ) {
    this.mockCurrentPath = currentPath;
    this.mockFiles = new Map(Object.entries(files));
    this.mockDirectories = new Set(directories);
    this.mockStats = new Map();

    // Create mock stats for directories
    directories.forEach(dir => {
      this.mockStats.set(dir, {
        isDirectory: () => true,
        isFile: () => false,
      } as fs.Stats);
    });

    // Create mock stats for files
    Object.keys(files).forEach(file => {
      this.mockStats.set(file, {
        isDirectory: () => false,
        isFile: () => true,
      } as fs.Stats);
    });
  }

  getCurrentFilePath(): string {
    return this.mockCurrentPath;
  }

  existsSync(path: string): boolean {
    return this.mockFiles.has(path) || this.mockDirectories.has(path);
  }

  readFileSync(path: string): string {
    const content = this.mockFiles.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }

  statSync(path: string): fs.Stats {
    const stats = this.mockStats.get(path);
    if (!stats) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }
    return stats;
  }

  readdirSync(path: string): fs.Dirent[] {
    if (!this.mockDirectories.has(path)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    // Return mock directory entries
    const entries: fs.Dirent[] = [];

    // Add subdirectories
    this.mockDirectories.forEach(dir => {
      if (dir.startsWith(path + '/') && !dir.substring(path.length + 1).includes('/')) {
        entries.push({
          name: dir.substring(path.length + 1),
          isDirectory: () => true,
          isFile: () => false,
        } as fs.Dirent);
      }
    });

    // Add files
    this.mockFiles.forEach((_, file) => {
      if (file.startsWith(path + '/') && !file.substring(path.length + 1).includes('/')) {
        entries.push({
          name: file.substring(path.length + 1),
          isDirectory: () => false,
          isFile: () => true,
        } as fs.Dirent);
      }
    });

    return entries;
  }

  /**
   * Add a mock file to the system
   */
  addMockFile(path: string, content: string): void {
    this.mockFiles.set(path, content);
    this.mockStats.set(path, {
      isDirectory: () => false,
      isFile: () => true,
    } as fs.Stats);
  }

  /**
   * Add a mock directory to the system
   */
  addMockDirectory(path: string): void {
    this.mockDirectories.add(path);
    this.mockStats.set(path, {
      isDirectory: () => true,
      isFile: () => false,
    } as fs.Stats);
  }
}