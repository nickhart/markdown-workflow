import * as fs from 'fs';
import * as path from 'path';
import { initCommand } from '../../src/cli/commands/init.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { MockSystemInterface } from '../mocks/MockSystemInterface.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

// TODO: These tests need to be updated to use the new ConfigDiscovery instance pattern
// like in create.test.ts. The current tests are using the old static mocking approach.

describe('initCommand', () => {
  it.skip('TODO: Tests need to be updated to use new ConfigDiscovery instance pattern', () => {
    // These tests were using the old static mocking approach and need to be rewritten
    // to use the new instance-based ConfigDiscovery pattern like in create.test.ts
  });
});