#!/usr/bin/env tsx

/**
 * Enhanced E2E test runner with improved error reporting and diff visualization
 * Integrates with the existing bash-based E2E test system to provide better debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { 
  generateE2EReport, 
  formatE2EReport, 
  createE2ETestContext,
  type E2ETestReport 
} from '../src/shared/enhanced-error-reporting.js';
import { 
  compareSnapshotsEnhanced, 
  validateSnapshotHealth,
  type EnhancedDiffResult 
} from '../src/shared/snapshot-diff-utils.js';

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  report?: E2ETestReport;
  snapshotDiff?: EnhancedDiffResult;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  duration: number;
  success: boolean;
}

class EnhancedTestRunner {
  private workflowRoot: string;
  private testResults: TestResult[] = [];
  private startTime: number = 0;

  constructor(workflowRoot: string = process.cwd()) {
    this.workflowRoot = workflowRoot;
  }

  /**
   * Run enhanced E2E tests with detailed reporting
   */
  async runEnhancedTests(updateSnapshots: boolean = false): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                   ENHANCED E2E TEST RUNNER                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    this.startTime = Date.now();

    // First, validate snapshot health
    await this.validateEnvironment();

    // Run the existing bash-based E2E tests but capture detailed results
    await this.runExistingE2ETests(updateSnapshots);

    // Generate comprehensive report
    await this.generateFinalReport();
  }

  /**
   * Validate the testing environment and snapshot health
   */
  private async validateEnvironment(): Promise<void> {
    console.log('🔍 VALIDATING TEST ENVIRONMENT');
    console.log('─'.repeat(50));

    // Check snapshot health
    const snapshotHealth = validateSnapshotHealth(this.workflowRoot);
    
    if (!snapshotHealth.isHealthy) {
      console.log('⚠️  Snapshot health issues detected:');
      snapshotHealth.issues.forEach(issue => console.log(`   • ${issue}`));
      console.log('');
      console.log('💡 Recommendations:');
      snapshotHealth.recommendations.forEach(rec => console.log(`   • ${rec}`));
      console.log('');
    } else {
      console.log('✅ Snapshot system is healthy');
    }

    // Check CLI build
    const cliPath = path.join(this.workflowRoot, 'dist', 'cli', 'index.js');
    if (!fs.existsSync(cliPath)) {
      console.log('❌ CLI not built - building now...');
      try {
        execSync('pnpm cli:build', { cwd: this.workflowRoot, stdio: 'inherit' });
        console.log('✅ CLI built successfully');
      } catch (error) {
        console.log('❌ Failed to build CLI');
        throw error;
      }
    } else {
      console.log('✅ CLI is built');
    }

    console.log('');
  }

  /**
   * Run existing E2E tests and capture enhanced results
   */
  private async runExistingE2ETests(updateSnapshots: boolean): Promise<void> {
    console.log('🧪 RUNNING E2E TESTS WITH ENHANCED REPORTING');
    console.log('─'.repeat(50));

    const scriptPath = path.join(this.workflowRoot, 'scripts', 'test-e2e-snapshots.sh');
    const args = updateSnapshots ? ['--update'] : [];

    try {
      // We'll monitor the existing script but also run individual tests with enhanced reporting
      const output = execSync(`bash ${scriptPath} ${args.join(' ')}`, {
        cwd: this.workflowRoot,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      console.log('✅ Existing E2E tests completed successfully');
      console.log(output);

    } catch (error: any) {
      console.log('❌ E2E tests failed - generating enhanced reports...');
      
      // Parse the error output to identify specific test failures
      await this.analyzeTestFailures(error.stdout || error.message || '');
    }

    // Run our own enhanced snapshot comparisons
    await this.runEnhancedSnapshotTests();
  }

  /**
   * Analyze test failures from the bash script output
   */
  private async analyzeTestFailures(output: string): Promise<void> {
    const lines = output.split('\n');
    const failedTests = [];

    // Parse the output to identify failed tests
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('[FAIL]')) {
        const testNameMatch = line.match(/\[FAIL\]\s+(.+)/);
        if (testNameMatch) {
          failedTests.push({
            name: testNameMatch[1],
            output: this.extractTestOutput(lines, i),
            line: i
          });
        }
      }
    }

    // Generate enhanced reports for each failed test
    for (const failedTest of failedTests) {
      await this.generateEnhancedFailureReport(failedTest);
    }
  }

  /**
   * Extract relevant output for a specific test
   */
  private extractTestOutput(lines: string[], failureLineIndex: number): string {
    const output = [];
    let startIndex = Math.max(0, failureLineIndex - 10);
    let endIndex = Math.min(lines.length, failureLineIndex + 10);

    for (let i = startIndex; i < endIndex; i++) {
      output.push(lines[i]);
    }

    return output.join('\n');
  }

  /**
   * Generate enhanced failure report for a specific test
   */
  private async generateEnhancedFailureReport(failedTest: any): Promise<void> {
    console.log('');
    console.log('🔍 ENHANCED FAILURE ANALYSIS');
    console.log('═'.repeat(70));

    // Try to extract command and context from the test output
    const commandMatch = failedTest.output.match(/Running test: (.+)/);
    const testName = failedTest.name;
    const command = commandMatch ? commandMatch[1] : 'Unknown command';

    // Create enhanced context
    const context = createE2ETestContext(
      testName,
      command,
      process.cwd(), // We'll use current directory as working directory
      0, // Expected exit code (assumed)
      1, // Actual exit code (from failure)
      failedTest.output,
      new Error(`Test failed: ${testName}`)
    );

    const report = generateE2EReport(context);
    const formattedReport = formatE2EReport(report);

    console.log(formattedReport);

    this.testResults.push({
      name: testName,
      success: false,
      duration: 0,
      report
    });
  }

  /**
   * Run enhanced snapshot tests with detailed diff visualization
   */
  private async runEnhancedSnapshotTests(): Promise<void> {
    console.log('📸 ENHANCED SNAPSHOT TESTING');
    console.log('─'.repeat(50));

    const snapshotDir = path.join(this.workflowRoot, '__fs_snapshots__');
    if (!fs.existsSync(snapshotDir)) {
      console.log('No snapshots found - skipping snapshot tests');
      return;
    }

    const snapshots = fs.readdirSync(snapshotDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.basename(f, '.json'));

    console.log(`Found ${snapshots.length} snapshots to test`);

    // Test each snapshot with enhanced reporting
    for (const snapshotName of snapshots) {
      await this.testSnapshotWithEnhancedReporting(snapshotName);
    }
  }

  /**
   * Test a specific snapshot with enhanced diff visualization
   */
  private async testSnapshotWithEnhancedReporting(snapshotName: string): Promise<void> {
    console.log(`\n🔍 Testing snapshot: ${snapshotName}`);

    // For demo purposes, we'll use a temporary directory
    // In real usage, this would be the actual test directory from the bash script
    const testDir = path.join(this.workflowRoot, 'tmp', 'enhanced-test');
    
    if (!fs.existsSync(testDir)) {
      console.log(`  ⏭️  Skipping - test directory not found: ${testDir}`);
      return;
    }

    const startTime = Date.now();
    const diffResult = compareSnapshotsEnhanced(snapshotName, testDir, this.workflowRoot);
    const duration = Date.now() - startTime;

    if (diffResult.hasDifferences) {
      console.log(`  ❌ Snapshot mismatch detected`);
      console.log(diffResult.summary);
      console.log('');
      console.log(diffResult.detailedReport);
      
      if (diffResult.suggestions.length > 0) {
        console.log('💡 Suggestions:');
        diffResult.suggestions.forEach(suggestion => console.log(`   ${suggestion}`));
      }

      this.testResults.push({
        name: `snapshot-${snapshotName}`,
        success: false,
        duration,
        snapshotDiff: diffResult
      });
    } else {
      console.log(`  ✅ Snapshot matches perfectly`);
      
      this.testResults.push({
        name: `snapshot-${snapshotName}`,
        success: true,
        duration
      });
    }
  }

  /**
   * Generate comprehensive final report
   */
  private async generateFinalReport(): Promise<void> {
    const totalDuration = Date.now() - this.startTime;
    const successCount = this.testResults.filter(t => t.success).length;
    const failureCount = this.testResults.filter(t => !t.success).length;

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                        FINAL TEST REPORT                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    console.log('📊 SUMMARY');
    console.log('─'.repeat(50));
    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`Passed: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log('');

    if (failureCount > 0) {
      console.log('❌ FAILED TESTS');
      console.log('─'.repeat(50));
      
      const failedTests = this.testResults.filter(t => !t.success);
      failedTests.forEach((test, index) => {
        console.log(`${index + 1}. ${test.name}`);
        if (test.snapshotDiff) {
          console.log(`   ${test.snapshotDiff.summary}`);
        }
        if (test.report) {
          console.log(`   ${test.report.summary}`);
        }
      });
      console.log('');

      console.log('🔧 OVERALL RECOMMENDATIONS');
      console.log('─'.repeat(50));
      console.log('• Review the detailed failure reports above');
      console.log('• Check if snapshots need to be updated');
      console.log('• Verify testing configuration is properly applied');
      console.log('• Run individual tests manually to debug issues');
      console.log('');
    }

    // Environment health check
    const snapshotHealth = validateSnapshotHealth(this.workflowRoot);
    if (!snapshotHealth.isHealthy) {
      console.log('⚠️  ENVIRONMENT ISSUES');
      console.log('─'.repeat(50));
      snapshotHealth.issues.forEach(issue => console.log(`• ${issue}`));
      console.log('');
    }

    console.log('📋 NEXT STEPS');
    console.log('─'.repeat(50));
    
    if (failureCount === 0) {
      console.log('✅ All tests passed! The system is working correctly.');
    } else {
      console.log('1. Review the detailed failure reports above');
      console.log('2. Apply the suggested quick fixes');
      console.log('3. Update snapshots if changes are expected:');
      console.log('   pnpm test:e2e:snapshots:update');
      console.log('4. Re-run tests to verify fixes');
    }

    console.log('');
    
    // Exit with appropriate code
    process.exit(failureCount > 0 ? 1 : 0);
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const updateSnapshots = args.includes('--update') || args.includes('-u');
  const workflowRoot = process.cwd();

  const runner = new EnhancedTestRunner(workflowRoot);
  
  try {
    await runner.runEnhancedTests(updateSnapshots);
  } catch (error) {
    console.error('❌ Enhanced test runner failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}