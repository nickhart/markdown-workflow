#!/usr/bin/env node

/**
 * Filesystem Snapshot Tool
 * Jest-like snapshot testing for filesystem directory structures
 *
 * Usage:
 *   node scripts/snapshot.js create <name> <directory>
 *   node scripts/snapshot.js compare <name> <directory>
 *   node scripts/snapshot.js list
 *   node scripts/snapshot.js delete <name>
 *   node scripts/snapshot.js update <name> <directory>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { program } from 'commander';

const SNAPSHOTS_DIR = path.join(process.cwd(), '__fs_snapshots__');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

/**
 * Create a snapshot of a directory structure
 */
function createSnapshot(directory, options = {}) {
  const { includeContent = false, excludePatterns = [] } = options;

  function shouldExclude(filePath) {
    return excludePatterns.some((pattern) => {
      if (typeof pattern === 'string') {
        return filePath.includes(pattern);
      }
      if (pattern instanceof RegExp) {
        return pattern.test(filePath);
      }
      return false;
    });
  }

  function scanDirectory(dir, relativePath = '') {
    const items = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const fullPath = path.join(dir, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);

        if (shouldExclude(entryRelativePath)) {
          continue;
        }

        const stats = fs.statSync(fullPath);
        const item = {
          name: entry.name,
          path: entryRelativePath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? stats.size : 0,
          modified: stats.mtime.toISOString(),
        };

        if (entry.isFile() && includeContent) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            item.contentHash = crypto.createHash('md5').update(content).digest('hex');
            // Only include content for small text files
            if (stats.size < 10000 && isTextFile(fullPath)) {
              item.content = content;
            }
          } catch (error) {
            item.contentHash = `ERROR: ${error.message}`;
          }
        }

        if (entry.isDirectory()) {
          item.children = scanDirectory(fullPath, entryRelativePath);
        }

        items.push(item);
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error.message);
    }

    return items;
  }

  return {
    options,
    tree: scanDirectory(directory),
  };
}

/**
 * Check if a file appears to be a text file
 */
function isTextFile(filePath) {
  const textExtensions = [
    '.txt',
    '.md',
    '.json',
    '.yml',
    '.yaml',
    '.js',
    '.ts',
    '.html',
    '.css',
    '.xml',
  ];
  const ext = path.extname(filePath).toLowerCase();
  return textExtensions.includes(ext);
}

/**
 * Save snapshot to disk
 */
function saveSnapshot(name, snapshot) {
  const snapshotPath = path.join(SNAPSHOTS_DIR, `${name}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  return snapshotPath;
}

/**
 * Load snapshot from disk
 */
function loadSnapshot(name) {
  const snapshotPath = path.join(SNAPSHOTS_DIR, `${name}.json`);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot '${name}' not found`);
  }
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
}

/**
 * Compare two snapshots and return differences
 */
function compareSnapshots(snapshot1, snapshot2) {
  const differences = {
    added: [],
    removed: [],
    modified: [],
    typeChanged: [],
  };

  function buildPathMap(tree, pathMap = new Map()) {
    for (const item of tree) {
      const fullPath = item.path;
      pathMap.set(fullPath, item);

      if (item.children) {
        buildPathMap(item.children, pathMap);
      }
    }
    return pathMap;
  }

  const map1 = buildPathMap(snapshot1.tree);
  const map2 = buildPathMap(snapshot2.tree);

  // Find added files
  for (const [path, item] of map2) {
    if (!map1.has(path)) {
      differences.added.push(item);
    }
  }

  // Find removed files and modifications
  for (const [path, item1] of map1) {
    const item2 = map2.get(path);

    if (!item2) {
      differences.removed.push(item1);
    } else {
      // Check for type changes
      if (item1.type !== item2.type) {
        differences.typeChanged.push({ path, from: item1.type, to: item2.type });
      }
      // Check for modifications (files only)
      else if (item1.type === 'file') {
        const sizeChanged = item1.size !== item2.size;
        const timeChanged = item1.modified !== item2.modified;
        const contentChanged =
          item1.contentHash && item2.contentHash && item1.contentHash !== item2.contentHash;

        if (sizeChanged || timeChanged || contentChanged) {
          differences.modified.push({
            path,
            changes: {
              size: sizeChanged ? { from: item1.size, to: item2.size } : null,
              modified: timeChanged ? { from: item1.modified, to: item2.modified } : null,
              content: contentChanged ? { from: item1.contentHash, to: item2.contentHash } : null,
            },
          });
        }
      }
    }
  }

  return differences;
}

/**
 * Format differences for display
 */
function formatDifferences(differences) {
  const lines = [];

  if (differences.added.length > 0) {
    lines.push('\n+ Added files:');
    differences.added.forEach((item) => {
      lines.push(`  + ${item.path} (${item.type})`);
    });
  }

  if (differences.removed.length > 0) {
    lines.push('\n- Removed files:');
    differences.removed.forEach((item) => {
      lines.push(`  - ${item.path} (${item.type})`);
    });
  }

  if (differences.modified.length > 0) {
    lines.push('\n~ Modified files:');
    differences.modified.forEach((item) => {
      lines.push(`  ~ ${item.path}`);
      if (item.changes.size) {
        lines.push(`    size: ${item.changes.size.from} → ${item.changes.size.to}`);
      }
      if (item.changes.modified) {
        lines.push(`    modified: ${item.changes.modified.from} → ${item.changes.modified.to}`);
      }
      if (item.changes.content) {
        lines.push(`    content: ${item.changes.content.from} → ${item.changes.content.to}`);
      }
    });
  }

  if (differences.typeChanged.length > 0) {
    lines.push('\n⚠ Type changes:');
    differences.typeChanged.forEach((item) => {
      lines.push(`  ⚠ ${item.path}: ${item.from} → ${item.to}`);
    });
  }

  return lines.join('\n');
}

// CLI Commands

program.name('snapshot').description('Filesystem snapshot tool for testing').version('1.0.0');

program
  .command('create')
  .description('Create a new snapshot')
  .argument('<name>', 'snapshot name')
  .argument('<directory>', 'directory to snapshot')
  .option('--content', 'include file content hashes')
  .option('--exclude <patterns...>', 'patterns to exclude')
  .action((name, directory, options) => {
    try {
      const excludePatterns = options.exclude || [
        'node_modules',
        '.git',
        '__fs_snapshots__',
        '.DS_Store',
        '*.log',
        'dist',
        'build',
        'coverage',
      ];

      console.log(`Creating snapshot '${name}' of '${directory}'...`);
      const snapshot = createSnapshot(directory, {
        includeContent: options.content,
        excludePatterns,
      });

      const snapshotPath = saveSnapshot(name, snapshot);
      console.log(`✅ Snapshot saved to: ${snapshotPath}`);
      console.log(`📁 Captured ${countItems(snapshot.tree)} items`);
    } catch (error) {
      console.error('❌ Error creating snapshot:', error.message);
      process.exit(1);
    }
  });

program
  .command('compare')
  .description('Compare directory with existing snapshot')
  .argument('<name>', 'snapshot name to compare against')
  .argument('<directory>', 'directory to compare')
  .option('--content', 'include file content hashes in comparison')
  .option('--exclude <patterns...>', 'patterns to exclude')
  .option('--update', 'update snapshot if different')
  .action((name, directory, options) => {
    try {
      const excludePatterns = options.exclude || [
        'node_modules',
        '.git',
        '__fs_snapshots__',
        '.DS_Store',
        '*.log',
        'dist',
        'build',
        'coverage',
      ];

      console.log(`Comparing '${directory}' with snapshot '${name}'...`);

      const existingSnapshot = loadSnapshot(name);
      const currentSnapshot = createSnapshot(directory, {
        includeContent: options.content,
        excludePatterns,
      });

      const differences = compareSnapshots(existingSnapshot, currentSnapshot);
      const totalChanges =
        differences.added.length +
        differences.removed.length +
        differences.modified.length +
        differences.typeChanged.length;

      if (totalChanges === 0) {
        console.log('✅ No differences found - snapshot matches!');
      } else {
        console.log(`❌ Found ${totalChanges} difference(s):`);
        console.log(formatDifferences(differences));

        if (options.update) {
          saveSnapshot(name, currentSnapshot);
          console.log(`\n🔄 Snapshot '${name}' updated`);
        } else {
          console.log(`\n💡 Use --update to update the snapshot`);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error('❌ Error comparing snapshots:', error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all snapshots')
  .action(() => {
    try {
      const snapshots = fs
        .readdirSync(SNAPSHOTS_DIR)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
          const name = path.basename(file, '.json');
          const snapshotPath = path.join(SNAPSHOTS_DIR, file);
          const stats = fs.statSync(snapshotPath);
          const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

          return {
            name,
            created: stats.birthtime.toISOString(),
            items: countItems(snapshot.tree),
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

      if (snapshots.length === 0) {
        console.log('No snapshots found');
        return;
      }

      console.log('Available snapshots:\n');
      snapshots.forEach((snapshot) => {
        console.log(`📸 ${snapshot.name}`);
        console.log(`   Created: ${snapshot.created}`);
        console.log(`   Items: ${snapshot.items}`);
        console.log('');
      });
    } catch (error) {
      console.error('❌ Error listing snapshots:', error.message);
      process.exit(1);
    }
  });

program
  .command('delete')
  .description('Delete a snapshot')
  .argument('<name>', 'snapshot name to delete')
  .action((name) => {
    try {
      const snapshotPath = path.join(SNAPSHOTS_DIR, `${name}.json`);
      if (!fs.existsSync(snapshotPath)) {
        console.error(`❌ Snapshot '${name}' not found`);
        process.exit(1);
      }

      fs.unlinkSync(snapshotPath);
      console.log(`✅ Snapshot '${name}' deleted`);
    } catch (error) {
      console.error('❌ Error deleting snapshot:', error.message);
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Update an existing snapshot')
  .argument('<name>', 'snapshot name to update')
  .argument('<directory>', 'directory to snapshot')
  .option('--content', 'include file content hashes')
  .option('--exclude <patterns...>', 'patterns to exclude')
  .action((name, directory, options) => {
    try {
      // Check if snapshot exists
      const snapshotPath = path.join(SNAPSHOTS_DIR, `${name}.json`);
      if (!fs.existsSync(snapshotPath)) {
        console.error(`❌ Snapshot '${name}' not found`);
        process.exit(1);
      }

      const excludePatterns = options.exclude || [
        'node_modules',
        '.git',
        '__fs_snapshots__',
        '.DS_Store',
        '*.log',
        'dist',
        'build',
        'coverage',
      ];

      console.log(`Updating snapshot '${name}' with '${directory}'...`);
      const snapshot = createSnapshot(directory, {
        includeContent: options.content,
        excludePatterns,
      });

      saveSnapshot(name, snapshot);
      console.log(`✅ Snapshot '${name}' updated`);
      console.log(`📁 Captured ${countItems(snapshot.tree)} items`);
    } catch (error) {
      console.error('❌ Error updating snapshot:', error.message);
      process.exit(1);
    }
  });

function countItems(tree) {
  let count = tree.length;
  for (const item of tree) {
    if (item.children) {
      count += countItems(item.children);
    }
  }
  return count;
}

program.parse();
