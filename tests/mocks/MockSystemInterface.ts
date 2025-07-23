import * as fs from 'fs';
import { SystemInterface } from '../../src/core/SystemInterface';

type _FileSystemContent = {
  name: string;
  dirs: _FileSystemContent[];
  files: string[];
};

const _exampleFileSystemContent = {
  name: 'mock/system/root',
  dirs: [
    {
      name: 'workflows',
      dirs: [
        { name: 'job', dirs: [], files: ['job.md'] },
        { name: 'blog', dirs: [], files: ['blog.md'] },
      ],
      files: [],
    },
    { name: 'collections', dirs: [], files: [] },
  ],
  files: ['package.json'],
};

/**
 * Mock implementation of SystemInterface for testing
 */
export class MockSystemInterface implements SystemInterface {
  private mockCurrentPath: string;
  private mockFiles: Map<string, string>;
  private mockDirectories: Set<string>;
  private mockStats: Map<string, fs.Stats>;

  // Jest spies for tracking method calls
  public writeFileSync = jest.fn();
  public mkdirSync = jest.fn();
  public renameSync = jest.fn();
  public copyFileSync = jest.fn();

  constructor(
    currentPath: string = '/mock/system/root',
    files: Record<string, string> = {},
    directories: string[] = [],
  ) {
    this.mockCurrentPath = currentPath;
    this.mockFiles = new Map(Object.entries(files));
    this.mockDirectories = new Set(directories);
    this.mockStats = new Map();

    // Create mock stats for directories
    directories.forEach((dir) => {
      this.mockStats.set(dir, {
        isDirectory: () => true,
        isFile: () => false,
      } as fs.Stats);
    });

    // Create mock stats for files
    Object.keys(files).forEach((file) => {
      this.mockStats.set(file, {
        isDirectory: () => false,
        isFile: () => true,
      } as fs.Stats);
    });

    // Setup mock implementations for new methods
    this.writeFileSync.mockImplementation((path: string, data: string) => {
      this.addMockFile(path, data);
    });

    this.mkdirSync.mockImplementation((path: string, options?: { recursive?: boolean }) => {
      this.addMockDirectory(path);
      // If recursive, create all parent directories
      if (options?.recursive) {
        const parts = path.split('/').filter(Boolean);
        let currentPath = '';
        for (const part of parts) {
          currentPath += '/' + part;
          if (!this.mockDirectories.has(currentPath)) {
            this.addMockDirectory(currentPath);
          }
        }
      }
    });

    this.renameSync.mockImplementation((oldPath: string, newPath: string) => {
      // Handle file moves
      if (this.mockFiles.has(oldPath)) {
        const content = this.mockFiles.get(oldPath)!;
        this.mockFiles.delete(oldPath);
        this.addMockFile(newPath, content);
      }
      // Handle directory moves
      if (this.mockDirectories.has(oldPath)) {
        this.mockDirectories.delete(oldPath);
        this.addMockDirectory(newPath);

        // Move all files and subdirectories
        const filesToMove = Array.from(this.mockFiles.keys()).filter((p) =>
          p.startsWith(oldPath + '/'),
        );
        const dirsToMove = Array.from(this.mockDirectories).filter((p) =>
          p.startsWith(oldPath + '/'),
        );

        filesToMove.forEach((filePath) => {
          const content = this.mockFiles.get(filePath)!;
          const newFilePath = filePath.replace(oldPath, newPath);
          this.mockFiles.delete(filePath);
          this.addMockFile(newFilePath, content);
        });

        dirsToMove.forEach((dirPath) => {
          const newDirPath = dirPath.replace(oldPath, newPath);
          this.mockDirectories.delete(dirPath);
          this.addMockDirectory(newDirPath);
        });
      }
    });

    this.copyFileSync.mockImplementation((src: string, dest: string) => {
      const content = this.mockFiles.get(src);
      if (content !== undefined) {
        this.addMockFile(dest, content);
      } else {
        throw new Error(`ENOENT: no such file or directory, open '${src}'`);
      }
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
    this.mockDirectories.forEach((dir) => {
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
