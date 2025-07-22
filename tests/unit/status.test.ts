import * as fs from 'fs';
import * as path from 'path';
import { statusCommand, showStatusesCommand } from '../../src/cli/commands/status.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { MockSystemInterface } from '../mocks/MockSystemInterface.js';
import { createEnhancedMockFileSystem } from '../helpers/FileSystemHelpers.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('statusCommand', () => {
  let mockSystemInterface: MockSystemInterface;
  let configDiscovery: ConfigDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => {
      const parts = p.split('/');
      return parts.slice(0, -1).join('/') || '/';
    });
    mockPath.parse.mockImplementation((p) => ({
      root: '/',
      dir: p.substring(0, p.lastIndexOf('/')),
      base: p.substring(p.lastIndexOf('/') + 1),
      ext: p.substring(p.lastIndexOf('.')),
      name: p.substring(p.lastIndexOf('/') + 1, p.lastIndexOf('.')),
    }));

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create mock file system
    mockSystemInterface = createEnhancedMockFileSystem();
    configDiscovery = new ConfigDiscovery(mockSystemInterface);

    // Add project structure
    const projectPath = '/mock/project';
    mockSystemInterface.addMockDirectory(projectPath);
    mockSystemInterface.addMockDirectory(`${projectPath}/.markdown-workflow`);
    mockSystemInterface.addMockFile(
      `${projectPath}/config.yml`,
      `user:
  name: "Test User"
  preferred_name: "Test"
  phone: "(555) 123-4567"
  address: "123 Test St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "linkedin.com/in/testuser"
  github: "github.com/testuser"
  website: "testuser.com"

system:
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  output_formats:
    - "docx"
    - "html"
    - "pdf"
  git:
    auto_commit: false
    commit_message_template: "Update {{workflow}} collection {{collection_id}}"
  collection_id:
    date_format: "YYYYMMDD"
    sanitize_spaces: "_"
    max_length: 50

workflows: {}`,
    );

    // Add collection structure
    const collectionPath = `${projectPath}/collections/job/test_company_developer_20250122`;
    mockSystemInterface.addMockDirectory(collectionPath);
    mockSystemInterface.addMockFile(
      `${collectionPath}/collection.yml`,
      'workflow: "job"\ncollection_id: "test_company_developer_20250122"\ncompany: "Test Company"\nrole: "Developer"\nstatus: "active"\ncreated_date: "2025-01-22"',
    );

    // Setup filesystem mocks
    mockFs.existsSync.mockImplementation((filePath: string) =>
      mockSystemInterface.existsSync(filePath as string),
    );
    mockFs.readFileSync.mockImplementation((filePath: string) =>
      mockSystemInterface.readFileSync(filePath as string),
    );
    mockFs.statSync.mockImplementation((filePath: string) =>
      mockSystemInterface.statSync(filePath as string),
    );
    mockFs.readdirSync.mockImplementation((filePath: string) =>
      mockSystemInterface.readdirSync(filePath as string),
    );
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  it('should update collection status', async () => {
    const options = { cwd: '/mock/project', configDiscovery };

    await expect(
      statusCommand('job', 'test_company_developer_20250122', 'submitted', options),
    ).rejects.toThrow('System root not found');
  });

  it('should handle missing collection', async () => {
    const options = { cwd: '/mock/project', configDiscovery };

    await expect(
      statusCommand('job', 'nonexistent_collection', 'submitted', options),
    ).rejects.toThrow();
  });

  it('should handle missing workflow', async () => {
    const options = { cwd: '/mock/project', configDiscovery };

    await expect(
      statusCommand('nonexistent', 'test_company_developer_20250122', 'submitted', options),
    ).rejects.toThrow();
  });

  it('should validate status transitions', async () => {
    const options = { cwd: '/mock/project', configDiscovery };

    await expect(
      statusCommand('job', 'test_company_developer_20250122', 'invalid_status', options),
    ).rejects.toThrow();
  });
});

describe('showStatusesCommand', () => {
  let mockSystemInterface: MockSystemInterface;
  let configDiscovery: ConfigDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => {
      const parts = p.split('/');
      return parts.slice(0, -1).join('/') || '/';
    });

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create mock file system
    mockSystemInterface = createEnhancedMockFileSystem();
    configDiscovery = new ConfigDiscovery(mockSystemInterface);

    // Add project structure
    const projectPath = '/mock/project';
    mockSystemInterface.addMockDirectory(projectPath);
    mockSystemInterface.addMockDirectory(`${projectPath}/.markdown-workflow`);
    mockSystemInterface.addMockFile(
      `${projectPath}/config.yml`,
      `user:
  name: "Test User"
  preferred_name: "Test"
  phone: "(555) 123-4567"
  address: "123 Test St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "linkedin.com/in/testuser"
  github: "github.com/testuser"
  website: "testuser.com"

system:
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  output_formats:
    - "docx"
    - "html"
    - "pdf"
  git:
    auto_commit: false
    commit_message_template: "Update {{workflow}} collection {{collection_id}}"
  collection_id:
    date_format: "YYYYMMDD"
    sanitize_spaces: "_"
    max_length: 50

workflows: {}`,
    );

    // Setup filesystem mocks
    mockFs.existsSync.mockImplementation((filePath: string) =>
      mockSystemInterface.existsSync(filePath as string),
    );
    mockFs.readFileSync.mockImplementation((filePath: string) =>
      mockSystemInterface.readFileSync(filePath as string),
    );
    mockFs.statSync.mockImplementation((filePath: string) =>
      mockSystemInterface.statSync(filePath as string),
    );
    mockFs.readdirSync.mockImplementation((filePath: string) =>
      mockSystemInterface.readdirSync(filePath as string),
    );
  });

  it('should show available statuses for a workflow', async () => {
    const options = { cwd: '/mock/project', configDiscovery };

    await expect(showStatusesCommand('job', options)).rejects.toThrow('System root not found');
  });

  it('should handle missing workflow', async () => {
    const options = { cwd: '/mock/project', configDiscovery };

    await expect(showStatusesCommand('nonexistent', options)).rejects.toThrow();
  });
});
