import * as YAML from 'yaml';
import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';
import { Collection } from '../../core/types.js';

interface ListOptions {
  status?: string;
  format?: 'table' | 'json' | 'yaml';
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * List collections for a specific workflow
 */
export async function listCommand(workflowName: string, options: ListOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Ensure we're in a project
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  // Initialize workflow engine
  const engine = new WorkflowEngine(projectRoot);

  // Validate workflow exists
  const availableWorkflows = engine.getAvailableWorkflows();
  if (!availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
    );
  }

  // Get collections
  const collections = await engine.getCollections(workflowName);

  // Filter by status if specified
  const filteredCollections = options.status
    ? collections.filter((collection) => collection.metadata.status === options.status)
    : collections;

  // Display results
  if (filteredCollections.length === 0) {
    const statusFilter = options.status ? ` with status '${options.status}'` : '';
    console.log(`No collections found for workflow '${workflowName}'${statusFilter}`);
    return;
  }

  // Output format
  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(filteredCollections, null, 2));
      break;
    case 'yaml':
      console.log(YAML.stringify(filteredCollections));
      break;
    case 'table':
    default:
      displayCollectionsTable(filteredCollections, workflowName);
      break;
  }
}

/**
 * Display collections in a formatted table
 */
function displayCollectionsTable(collections: Collection[], workflowName: string): void {
  console.log(`\n${workflowName.toUpperCase()} COLLECTIONS\n`);

  // Sort by date created (newest first)
  const sortedCollections = [...collections].sort(
    (a, b) =>
      new Date(b.metadata.date_created).getTime() - new Date(a.metadata.date_created).getTime(),
  );

  // Calculate column widths
  const maxIdWidth = Math.max(12, ...sortedCollections.map((c) => c.metadata.collection_id.length));
  const maxCompanyWidth = Math.max(
    8,
    ...sortedCollections.map((c) =>
      typeof c.metadata.company === 'string' ? c.metadata.company.length : 0,
    ),
  );
  const maxRoleWidth = Math.max(
    6,
    ...sortedCollections.map((c) =>
      typeof c.metadata.role === 'string' ? c.metadata.role.length : 0,
    ),
  );
  const maxStatusWidth = Math.max(6, ...sortedCollections.map((c) => c.metadata.status.length));

  // Header
  const header = `${'ID'.padEnd(maxIdWidth)} | ${'COMPANY'.padEnd(maxCompanyWidth)} | ${'ROLE'.padEnd(maxRoleWidth)} | ${'STATUS'.padEnd(maxStatusWidth)} | CREATED    | MODIFIED`;
  console.log(header);
  console.log('-'.repeat(header.length));

  // Rows
  for (const collection of sortedCollections) {
    const id = collection.metadata.collection_id.padEnd(maxIdWidth);
    const company = (
      typeof collection.metadata.company === 'string' ? collection.metadata.company : ''
    ).padEnd(maxCompanyWidth);
    const role = (
      typeof collection.metadata.role === 'string' ? collection.metadata.role : ''
    ).padEnd(maxRoleWidth);
    const status = collection.metadata.status.padEnd(maxStatusWidth);
    const created = new Date(collection.metadata.date_created).toLocaleDateString();
    const modified = new Date(collection.metadata.date_modified).toLocaleDateString();

    console.log(`${id} | ${company} | ${role} | ${status} | ${created} | ${modified}`);
  }

  console.log(`\nTotal: ${collections.length} collections`);
}

export default listCommand;
