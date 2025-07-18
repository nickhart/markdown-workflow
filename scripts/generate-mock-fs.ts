#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

interface CrawlerOptions {
  rootPath: string;
  outputPath: string;
  maxDepth?: number;
  excludePatterns?: string[];
  includeContent?: boolean;
  exportName?: string;
}

/**
 * Crawl a directory structure and generate FileSystemPaths data
 */
export function crawlDirectoryStructure(
  rootPath: string,
  options: Partial<CrawlerOptions> = {}
): Record<string, string> {
  const {
    maxDepth = 10,
    excludePatterns = ['.git', 'node_modules', '.DS_Store'],
    includeContent = true
  } = options;

  const result: Record<string, string> = {};
  
  function shouldExclude(filePath: string): boolean {
    return excludePatterns.some(pattern => 
      filePath.includes(pattern) || path.basename(filePath).match(new RegExp(pattern))
    );
  }

  function crawl(currentPath: string, depth: number = 0): void {
    if (depth > maxDepth || shouldExclude(currentPath)) {
      return;
    }

    try {
      const stat = fs.statSync(currentPath);
      
      if (stat.isFile()) {
        const relativePath = path.relative(rootPath, currentPath);
        const absolutePath = `/${relativePath.replace(/\\/g, '/')}`;
        
        if (includeContent) {
          try {
            const content = fs.readFileSync(currentPath, 'utf-8');
            result[absolutePath] = content;
          } catch (err) {
            // Handle binary files or permission issues
            result[absolutePath] = `[Binary or unreadable file: ${path.basename(currentPath)}]`;
          }
        } else {
          result[absolutePath] = `[File: ${path.basename(currentPath)}]`;
        }
      } else if (stat.isDirectory()) {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          crawl(itemPath, depth + 1);
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not access ${currentPath}:`, err);
    }
  }

  crawl(rootPath);
  return result;
}

/**
 * Generate TypeScript code for FileSystemPaths
 */
export function generateFileSystemCode(
  paths: Record<string, string>,
  exportName: string = 'mockFileSystem'
): string {
  const escapedPaths: Record<string, string> = {};
  
  for (const [filePath, content] of Object.entries(paths)) {
    // Escape content for TypeScript string literals
    const escapedContent = content
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
    
    escapedPaths[filePath] = escapedContent;
  }

  const pathEntries = Object.entries(escapedPaths)
    .map(([filePath, content]) => `  '${filePath}': \`${content}\``)
    .join(',\n');

  return `// Auto-generated mock file system data
import { FileSystemPaths } from '../helpers/FileSystemHelpers.js';

export const ${exportName}: FileSystemPaths = {
${pathEntries}
};

// Usage example:
// const mockFs = createFileSystemFromPaths(${exportName});
`;
}

/**
 * CLI functionality
 */
export async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: generate-mock-fs <source-directory> <output-file> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --max-depth <n>     Maximum directory depth to crawl (default: 10)');
    console.error('  --exclude <pattern> Exclude files/directories matching pattern');
    console.error('  --no-content        Only include file names, not content');
    console.error('  --export-name <name> Name for the exported constant (default: mockFileSystem)');
    console.error('');
    console.error('Examples:');
    console.error('  generate-mock-fs ./test-fixtures ./tests/fixtures/generated.ts');
    console.error('  generate-mock-fs ./workflows ./tests/fixtures/workflows.ts --export-name workflowsFileSystem');
    process.exit(1);
  }

  const sourcePath = path.resolve(args[0]);
  const outputPath = path.resolve(args[1]);
  
  const options: Partial<CrawlerOptions> = {
    rootPath: sourcePath,
    outputPath,
    includeContent: true,
    exportName: 'mockFileSystem'
  };

  // Parse additional arguments
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--max-depth' && i + 1 < args.length) {
      options.maxDepth = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--exclude' && i + 1 < args.length) {
      options.excludePatterns = options.excludePatterns || [];
      options.excludePatterns.push(args[i + 1]);
      i++;
    } else if (arg === '--no-content') {
      options.includeContent = false;
    } else if (arg === '--export-name' && i + 1 < args.length) {
      options.exportName = args[i + 1];
      i++;
    }
  }

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source directory ${sourcePath} does not exist`);
    process.exit(1);
  }

  console.log(`Crawling directory: ${sourcePath}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Options:`, options);

  try {
    const paths = crawlDirectoryStructure(sourcePath, options);
    const code = generateFileSystemCode(paths, options.exportName!);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, code);
    
    console.log(`✅ Generated mock file system with ${Object.keys(paths).length} files`);
    console.log(`📁 Output written to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error generating mock file system:', error);
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}