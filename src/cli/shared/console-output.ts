/**
 * Console output formatting utilities for CLI commands
 *
 * Provides standardized console output formatting for CLI user interaction.
 * This is CLI presentation layer functionality - purely for user interface.
 */

/**
 * Standard success message format for CLI output
 */
export function logSuccess(message: string): void {
  console.log(`✅ ${message}`);
}

/**
 * Standard error message format for CLI output
 */
export function logError(message: string): void {
  console.error(`❌ ${message}`);
}

/**
 * Standard warning message format for CLI output
 */
export function logWarning(message: string): void {
  console.warn(`⚠️ ${message}`);
}

/**
 * Standard info message format for CLI output
 */
export function logInfo(message: string): void {
  console.log(`ℹ️ ${message}`);
}

/**
 * Log the creation of a collection with standard formatting
 */
export function logCollectionCreation(collectionId: string, collectionPath: string): void {
  console.log(`Creating collection: ${collectionId}`);
  console.log(`Location: ${collectionPath}`);
}

/**
 * Log collection updates with standard formatting
 */
export function logCollectionUpdate(collectionId: string, collectionPath: string): void {
  console.log(`Updating collection: ${collectionId}`);
  console.log(`Location: ${collectionPath}`);
}

/**
 * Log successful scraping with standard formatting
 */
export function logScrapingSuccess(method: string, outputFile: string): void {
  logSuccess(`Successfully scraped using ${method}: ${outputFile}`);
}

/**
 * Log scraping error with standard formatting
 */
export function logScrapingError(error: string): void {
  logError(`Failed to scrape URL: ${error}`);
}

/**
 * Log next steps for CLI workflows with standard formatting
 */
export function logNextSteps(
  workflowName: string,
  collectionId: string,
  collectionPath: string,
  defaultFormat?: string,
): void {
  const formatDisplay = defaultFormat ? defaultFormat.toUpperCase() : 'DOCX';
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit files in ${collectionPath}`);
  console.log(`  2. Run wf format ${workflowName} ${collectionId} to convert to ${formatDisplay}`);
  console.log(`  3. Run wf status ${workflowName} ${collectionId} <status> to update status`);
}

/**
 * Log template usage with standard formatting
 */
export function logTemplateUsage(templatePath: string): void {
  console.log(`Using template: ${templatePath}`);
}

/**
 * Log file creation with standard formatting
 */
export function logFileCreation(filename: string): void {
  console.log(`Created: ${filename}`);
}

/**
 * Log force recreation with standard formatting
 */
export function logForceRecreation(collectionId: string, collectionPath: string): void {
  console.log(`Force recreating collection: ${collectionId}`);
  console.log(`Location: ${collectionPath}`);
}
