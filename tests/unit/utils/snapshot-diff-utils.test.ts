/**
 * Unit tests for enhanced snapshot diff utilities
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  compareSnapshotsEnhanced,
  validateSnapshotHealth,
  generateContentDiff,
} from '../../../src/utils/snapshot-diff-utils.js';

describe('Snapshot Diff Utils', () => {
  let tempDir: string;
  let testSnapshotDir: string;
  let testWorkflowRoot: string;

  beforeEach(() => {
    // Create temporary test environment
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
    testWorkflowRoot = path.join(tempDir, 'workflow');
    testSnapshotDir = path.join(testWorkflowRoot, '__fs_snapshots__');

    fs.mkdirSync(testWorkflowRoot, { recursive: true });
    fs.mkdirSync(testSnapshotDir, { recursive: true });

    // Create mock snapshot.js script
    const scriptsDir = path.join(testWorkflowRoot, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    const mockSnapshotScript = `#!/usr/bin/env node
// Mock snapshot.js for testing
const args = process.argv.slice(2);
const command = args[0];

if (command === 'compare') {
  const snapshotName = args[1];
  const directory = args[2];
  
  // Simulate different comparison results based on snapshot name
  if (snapshotName === 'matching-snapshot') {
    console.log('✅ No differences found - snapshot matches!');
    process.exit(0);
  } else if (snapshotName === 'diff-snapshot') {
    console.log('❌ Found 3 difference(s):');
    console.log('');
    console.log('+ Added files:');
    console.log('  + new-file.txt (file)');
    console.log('');
    console.log('- Removed files:');
    console.log('  - old-file.txt (file)');
    console.log('');
    console.log('~ Modified files:');
    console.log('  ~ existing-file.txt');
    console.log('    size: 100 → 150');
    console.log('    content: abc123 → def456');
    process.exit(1);
  } else {
    console.log('❌ Snapshot not found');
    process.exit(1);
  }
}
`;

    fs.writeFileSync(path.join(scriptsDir, 'snapshot.js'), mockSnapshotScript);
    fs.chmodSync(path.join(scriptsDir, 'snapshot.js'), '755');
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('compareSnapshotsEnhanced', () => {
    it('should handle non-existent snapshots gracefully', () => {
      const testDir = path.join(tempDir, 'test-dir');
      fs.mkdirSync(testDir, { recursive: true });

      const result = compareSnapshotsEnhanced('nonexistent-snapshot', testDir, testWorkflowRoot);

      expect(result.hasDifferences).toBe(true);
      expect(result.summary).toContain('not found');
      expect(result.suggestions.some((s) => s.includes('Create the snapshot with:'))).toBe(true);
    });

    it('should report no differences for matching snapshots', () => {
      const testDir = path.join(tempDir, 'test-dir');
      fs.mkdirSync(testDir, { recursive: true });

      // Create a mock snapshot file
      const snapshotPath = path.join(testSnapshotDir, 'matching-snapshot.json');
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            options: { includeContent: true },
            tree: [],
          },
          null,
          2,
        ),
      );

      const result = compareSnapshotsEnhanced('matching-snapshot', testDir, testWorkflowRoot);

      expect(result.hasDifferences).toBe(false);
      expect(result.summary).toContain('No differences found');
      expect(result.detailedReport).toContain('match the expected snapshot');
    });

    it('should parse and report differences correctly', () => {
      const testDir = path.join(tempDir, 'test-dir');
      fs.mkdirSync(testDir, { recursive: true });

      // Create a mock snapshot file
      const snapshotPath = path.join(testSnapshotDir, 'diff-snapshot.json');
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            options: { includeContent: true },
            tree: [],
          },
          null,
          2,
        ),
      );

      const result = compareSnapshotsEnhanced('diff-snapshot', testDir, testWorkflowRoot);

      expect(result.hasDifferences).toBe(true);
      expect(result.summary).toContain('Found 3 difference(s)');
      expect(result.differences.added).toHaveLength(1);
      expect(result.differences.removed).toHaveLength(1);
      expect(result.differences.modified).toHaveLength(1);
      expect(result.detailedReport).toContain('ADDED FILES');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should provide actionable suggestions for different types of differences', () => {
      const testDir = path.join(tempDir, 'test-dir');
      fs.mkdirSync(testDir, { recursive: true });

      const snapshotPath = path.join(testSnapshotDir, 'diff-snapshot.json');
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            options: { includeContent: true },
            tree: [],
          },
          null,
          2,
        ),
      );

      const result = compareSnapshotsEnhanced('diff-snapshot', testDir, testWorkflowRoot);

      expect(result.suggestions.some((s) => s.includes('To fix added files'))).toBe(true);
      expect(result.suggestions.some((s) => s.includes('To fix removed files'))).toBe(true);
      expect(result.suggestions.some((s) => s.includes('To fix modified files'))).toBe(true);
      expect(result.suggestions.some((s) => s.includes('Debugging tips'))).toBe(true);
    });
  });

  describe('validateSnapshotHealth', () => {
    it('should report healthy state for valid snapshot directory', () => {
      // Create a valid snapshot
      const snapshotPath = path.join(testSnapshotDir, 'test-snapshot.json');
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            options: { includeContent: true },
            tree: [],
          },
          null,
          2,
        ),
      );

      // Create test config
      const testConfigDir = path.join(testWorkflowRoot, 'test-configs');
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(path.join(testConfigDir, 'testing-config.yml'), 'test: config');

      const health = validateSnapshotHealth(testWorkflowRoot);

      expect(health.isHealthy).toBe(true);
      expect(health.issues).toHaveLength(0);
    });

    it('should detect missing snapshot directory', () => {
      fs.rmSync(testSnapshotDir, { recursive: true });

      const health = validateSnapshotHealth(testWorkflowRoot);

      expect(health.isHealthy).toBe(false);
      expect(health.issues).toContain('Snapshot directory does not exist');
      expect(health.recommendations.some((r) => r.includes('Create snapshots directory'))).toBe(
        true,
      );
    });

    it('should detect empty snapshot directory', () => {
      const health = validateSnapshotHealth(testWorkflowRoot);

      expect(health.isHealthy).toBe(false);
      expect(health.issues).toContain('No snapshots found');
      expect(health.recommendations.some((r) => r.includes('Create baseline snapshots'))).toBe(
        true,
      );
    });

    it('should detect corrupted snapshot files', () => {
      // Create a corrupted snapshot
      const corruptedPath = path.join(testSnapshotDir, 'corrupted.json');
      fs.writeFileSync(corruptedPath, 'invalid json {');

      const health = validateSnapshotHealth(testWorkflowRoot);

      expect(health.isHealthy).toBe(false);
      expect(health.issues.some((i) => i.includes('Corrupted snapshot: corrupted.json'))).toBe(
        true,
      );
      expect(
        health.recommendations.some((r) => r.includes('Delete and recreate corrupted snapshot')),
      ).toBe(true);
    });

    it('should detect missing test configuration', () => {
      // Create a valid snapshot but no test config
      const snapshotPath = path.join(testSnapshotDir, 'test-snapshot.json');
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            options: { includeContent: true },
            tree: [],
          },
          null,
          2,
        ),
      );

      const health = validateSnapshotHealth(testWorkflowRoot);

      expect(health.isHealthy).toBe(false);
      expect(health.issues).toContain('Testing configuration not found');
      expect(health.recommendations.some((r) => r.includes('testing-config.yml exists'))).toBe(
        true,
      );
    });
  });

  describe('generateContentDiff', () => {
    it('should generate side-by-side diff for text content', () => {
      const expected = 'line 1\nline 2\nline 3';
      const actual = 'line 1\nmodified line 2\nline 3\nline 4';

      const diff = generateContentDiff(expected, actual, 'test-file.txt');

      expect(diff).toContain('CONTENT DIFF: test-file.txt');
      expect(diff).toContain('EXPECTED');
      expect(diff).toContain('ACTUAL');
      expect(diff).toContain('line 1');
      expect(diff).toContain('modified line 2');
      expect(diff).toContain('line 4');
    });

    it('should handle empty content gracefully', () => {
      const diff = generateContentDiff('', '', 'empty-file.txt');

      expect(diff).toContain('CONTENT DIFF: empty-file.txt');
      expect(typeof diff).toBe('string');
    });

    it('should handle different line lengths', () => {
      const expected = 'short';
      const actual = 'this is a much longer line that should be truncated properly';

      const diff = generateContentDiff(expected, actual, 'length-test.txt');

      expect(diff).toContain('CONTENT DIFF: length-test.txt');
      expect(diff).toContain('short');
      expect(diff).toContain('this is a much longer line');
    });
  });
});
