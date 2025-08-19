import * as YAML from 'yaml';
import { WorkflowOrchestrator } from '../../services/workflow-orchestrator.js';
import { ConfigDiscovery } from '../../engine/config-discovery.js';
import { Collection } from '../../engine/types.js';

interface ListOptions {
  status?: string;
  nameFilter?: string;
  companyFilter?: string;
  titleFilter?: string;
  sort?: 'date-created' | 'date-modified' | 'status' | 'company' | 'title' | 'collection-id';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
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

  // Initialize workflow orchestrator
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });

  // Validate workflow exists
  const availableWorkflows = orchestrator.getAvailableWorkflows();
  if (!availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
    );
  }

  // Get collections
  const collections = await orchestrator.getCollections(workflowName);

  // Apply filters
  let filteredCollections = [...collections];

  // Filter by status(es) if specified
  if (options.status) {
    const statusFilters = options.status.split(',').map((s) => s.trim().toLowerCase());
    filteredCollections = filteredCollections.filter((collection) =>
      statusFilters.includes(collection.metadata.status.toLowerCase()),
    );
  }

  // Filter by collection ID pattern if specified
  if (options.nameFilter) {
    const pattern = options.nameFilter.toLowerCase();
    filteredCollections = filteredCollections.filter((collection) =>
      collection.metadata.collection_id.toLowerCase().includes(pattern),
    );
  }

  // Filter by company pattern if specified (job workflow)
  if (options.companyFilter && typeof filteredCollections[0]?.metadata.company === 'string') {
    const pattern = options.companyFilter.toLowerCase();
    filteredCollections = filteredCollections.filter((collection) => {
      const company = collection.metadata.company as string;
      return company && company.toLowerCase().includes(pattern);
    });
  }

  // Filter by title pattern if specified (blog workflow)
  if (options.titleFilter && typeof filteredCollections[0]?.metadata.title === 'string') {
    const pattern = options.titleFilter.toLowerCase();
    filteredCollections = filteredCollections.filter((collection) => {
      const title = collection.metadata.title as string;
      return title && title.toLowerCase().includes(pattern);
    });
  }

  // Apply sorting
  const sortField = options.sort || 'date-created';
  const sortOrder = options.sortOrder || 'desc';

  filteredCollections.sort((a, b) => {
    let aValue: string | Date | number;
    let bValue: string | Date | number;

    switch (sortField) {
      case 'date-created':
        aValue = new Date(a.metadata.date_created).getTime();
        bValue = new Date(b.metadata.date_created).getTime();
        break;
      case 'date-modified':
        aValue = new Date(a.metadata.date_modified).getTime();
        bValue = new Date(b.metadata.date_modified).getTime();
        break;
      case 'status':
        aValue = a.metadata.status.toLowerCase();
        bValue = b.metadata.status.toLowerCase();
        break;
      case 'company':
        aValue = ((a.metadata.company as string) || '').toLowerCase();
        bValue = ((b.metadata.company as string) || '').toLowerCase();
        break;
      case 'title':
        aValue = ((a.metadata.title as string) || '').toLowerCase();
        bValue = ((b.metadata.title as string) || '').toLowerCase();
        break;
      case 'collection-id':
        aValue = a.metadata.collection_id.toLowerCase();
        bValue = b.metadata.collection_id.toLowerCase();
        break;
      default:
        aValue = new Date(a.metadata.date_created).getTime();
        bValue = new Date(b.metadata.date_created).getTime();
    }

    // Handle comparison for different types
    let comparison = 0;
    if (aValue < bValue) {
      comparison = -1;
    } else if (aValue > bValue) {
      comparison = 1;
    }

    // Apply sort order
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Apply limit if specified
  if (options.limit && options.limit > 0) {
    filteredCollections = filteredCollections.slice(0, options.limit);
  }

  // Display results
  if (filteredCollections.length === 0) {
    const statusFilter = options.status ? ` with status '${options.status}'` : '';
    console.log(`📭 No collections found for workflow '${workflowName}'${statusFilter}`);
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
 * Get status icon for collection status
 */
function getStatusDisplay(status: string): string {
  const statusMap: Record<string, string> = {
    // Job workflow statuses
    active: '🔵',
    submitted: '📤',
    interview: '🎯',
    offered: '🎉',
    accepted: '✅',
    rejected: '❌',
    declined: '👋',
    withdrawn: '🚫',
    ghosted: '👻',

    // Blog workflow statuses
    draft: '📝',
    review: '👀',
    published: '🌐',
    updated: '🔄',
    archived: '📦',

    // Generic statuses
    pending: '⏳',
    completed: '✅',
    cancelled: '❌',
  };

  const icon = statusMap[status] || '❓';
  return `${icon} ${status}`;
}

/**
 * Display collections in a formatted table
 */
function displayCollectionsTable(collections: Collection[], workflowName: string): void {
  console.log(`\n📋 ${workflowName.toUpperCase()} COLLECTIONS\n`);

  // Collections are already sorted by the calling function, no need to sort again

  // Determine workflow type and columns
  const isJobWorkflow = workflowName === 'job';
  const isBlogWorkflow = workflowName === 'blog';

  if (isJobWorkflow) {
    displayJobCollectionsTable(collections);
  } else if (isBlogWorkflow) {
    displayBlogCollectionsTable(collections);
  } else {
    // Generic table for unknown workflows
    displayGenericCollectionsTable(collections);
  }

  console.log(`\n✨ Total: ${collections.length} collections`);
}

/**
 * Display job collections table
 */
function displayJobCollectionsTable(collections: Collection[]): void {
  // Calculate column widths
  const maxIdWidth = Math.max(12, ...collections.map((c) => c.metadata.collection_id.length));
  const maxCompanyWidth = Math.max(
    8,
    ...collections.map((c) =>
      typeof c.metadata.company === 'string' ? c.metadata.company.length : 0,
    ),
  );
  const maxRoleWidth = Math.max(
    6,
    ...collections.map((c) => (typeof c.metadata.role === 'string' ? c.metadata.role.length : 0)),
  );
  const maxStatusWidth = Math.max(6, ...collections.map((c) => c.metadata.status.length));

  // Header
  const header = `${'ID'.padEnd(maxIdWidth)} │ ${'COMPANY'.padEnd(maxCompanyWidth)} │ ${'ROLE'.padEnd(maxRoleWidth)} │ ${'STATUS'.padEnd(maxStatusWidth + 4)} │ ${'CREATED'}    │ ${'MODIFIED'}`;
  console.log(header);
  console.log('─'.repeat(header.length));

  // Rows
  for (const collection of collections) {
    const id = collection.metadata.collection_id.padEnd(maxIdWidth);
    const company = (
      typeof collection.metadata.company === 'string' ? collection.metadata.company : ''
    ).padEnd(maxCompanyWidth);
    const role = (
      typeof collection.metadata.role === 'string' ? collection.metadata.role : ''
    ).padEnd(maxRoleWidth);
    const statusDisplay = getStatusDisplay(collection.metadata.status).padEnd(maxStatusWidth + 4);
    const created = new Date(collection.metadata.date_created).toLocaleDateString();
    const modified = new Date(collection.metadata.date_modified).toLocaleDateString();

    console.log(`${id} │ ${company} │ ${role} │ ${statusDisplay} │ ${created} │ ${modified}`);
  }
}

/**
 * Display blog collections table
 */
function displayBlogCollectionsTable(collections: Collection[]): void {
  // Calculate column widths
  const maxIdWidth = Math.max(12, ...collections.map((c) => c.metadata.collection_id.length));
  const maxTitleWidth = Math.max(
    8,
    ...collections.map((c) => (typeof c.metadata.title === 'string' ? c.metadata.title.length : 0)),
  );
  const maxStatusWidth = Math.max(6, ...collections.map((c) => c.metadata.status.length));
  const maxTagsWidth = Math.max(
    6,
    ...collections.map((c) => {
      const tags = c.metadata.tags;
      if (Array.isArray(tags)) {
        return tags.join(', ').length;
      }
      return 0;
    }),
  );

  // Header
  const header = `${'ID'.padEnd(maxIdWidth)} │ ${'TITLE'.padEnd(maxTitleWidth)} │ ${'STATUS'.padEnd(maxStatusWidth + 4)} │ ${'TAGS'.padEnd(maxTagsWidth)} │ ${'CREATED'}    │ ${'MODIFIED'}`;
  console.log(header);
  console.log('─'.repeat(header.length));

  // Rows
  for (const collection of collections) {
    const id = collection.metadata.collection_id.padEnd(maxIdWidth);
    const title = (
      typeof collection.metadata.title === 'string' ? collection.metadata.title : ''
    ).padEnd(maxTitleWidth);
    const statusDisplay = getStatusDisplay(collection.metadata.status).padEnd(maxStatusWidth + 4);
    const tags = Array.isArray(collection.metadata.tags)
      ? collection.metadata.tags.join(', ').padEnd(maxTagsWidth)
      : ''.padEnd(maxTagsWidth);
    const created = new Date(collection.metadata.date_created).toLocaleDateString();
    const modified = new Date(collection.metadata.date_modified).toLocaleDateString();

    console.log(`${id} │ ${title} │ ${statusDisplay} │ ${tags} │ ${created} │ ${modified}`);
  }
}

/**
 * Display generic collections table for unknown workflows
 */
function displayGenericCollectionsTable(collections: Collection[]): void {
  // Calculate column widths
  const maxIdWidth = Math.max(12, ...collections.map((c) => c.metadata.collection_id.length));
  const maxStatusWidth = Math.max(6, ...collections.map((c) => c.metadata.status.length));

  // Header
  const header = `${'ID'.padEnd(maxIdWidth)} │ ${'STATUS'.padEnd(maxStatusWidth + 4)} │ ${'CREATED'}    │ ${'MODIFIED'}`;
  console.log(header);
  console.log('─'.repeat(header.length));

  // Rows
  for (const collection of collections) {
    const id = collection.metadata.collection_id.padEnd(maxIdWidth);
    const statusDisplay = getStatusDisplay(collection.metadata.status).padEnd(maxStatusWidth + 4);
    const created = new Date(collection.metadata.date_created).toLocaleDateString();
    const modified = new Date(collection.metadata.date_modified).toLocaleDateString();

    console.log(`${id} │ ${statusDisplay} │ ${created} │ ${modified}`);
  }
}

export default listCommand;
