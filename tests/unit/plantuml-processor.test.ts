import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PlantUMLProcessor } from '../../src/shared/plantuml-processor.js';
import type { PlantUMLConfig } from '../../src/shared/plantuml-processor.js';

// Mock external dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('os');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('PlantUMLProcessor', () => {
  let processor: PlantUMLProcessor;
  let mockConfig: PlantUMLConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      method: 'auto',
      docker_image: 'plantuml/plantuml',
      java_jar_path: '/usr/local/lib/plantuml.jar',
      output_format: 'png',
      timeout: 30,
    };

    processor = new PlantUMLProcessor(mockConfig);

    // Setup default mocks
    mockOs.tmpdir.mockReturnValue('/tmp');
    mockOs.homedir.mockReturnValue('/home/user');
    mockFs.existsSync.mockReturnValue(false); // Default to false
    mockFs.mkdirSync.mockReturnValue('');
    mockFs.writeFileSync.mockReturnValue();
    mockFs.unlinkSync.mockReturnValue();
  });

  describe('detectAvailableMethods', () => {
    it('should detect native plantuml when available', async () => {
      mockExecSync
        .mockImplementationOnce(() => 'PlantUML version 1.2023.0') // plantuml -version
        .mockImplementationOnce(() => 'java version "11.0.0"'); // java -version

      const methods = await PlantUMLProcessor.detectAvailableMethods();

      expect(methods.native).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('plantuml -version', {
        stdio: 'ignore',
        timeout: 5000,
      });
    });

    it('should detect java method when JAR file exists', async () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('plantuml not found');
        }) // plantuml -version fails
        .mockImplementationOnce(() => 'java version "11.0.0"') // java -version succeeds
        .mockImplementationOnce(() => {
          throw new Error('docker not found');
        }); // docker fails

      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === '/usr/local/lib/plantuml.jar';
      });

      const methods = await PlantUMLProcessor.detectAvailableMethods();

      expect(methods.native).toBe(false);
      expect(methods.java).toBe(true);
      expect(methods.docker).toBe(false);
    });

    it('should detect docker when available', async () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('plantuml not found');
        }) // plantuml fails
        .mockImplementationOnce(() => {
          throw new Error('java not found');
        }) // java fails
        .mockImplementationOnce(() => 'Docker version 20.10.0'); // docker succeeds

      mockFs.existsSync.mockReturnValue(false); // No JAR files

      const methods = await PlantUMLProcessor.detectAvailableMethods();

      expect(methods.native).toBe(false);
      expect(methods.java).toBe(false);
      expect(methods.docker).toBe(true);
    });

    it('should return all false when nothing is available', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });
      mockFs.existsSync.mockReturnValue(false);

      const methods = await PlantUMLProcessor.detectAvailableMethods();

      expect(methods.native).toBe(false);
      expect(methods.java).toBe(false);
      expect(methods.docker).toBe(false);
    });
  });

  describe('determineBestMethod', () => {
    it('should return configured method when not auto', async () => {
      processor = new PlantUMLProcessor({ ...mockConfig, method: 'docker' });

      const method = await processor.determineBestMethod();

      expect(method).toBe('docker');
    });

    it('should prefer native over other methods', async () => {
      mockExecSync
        .mockImplementationOnce(() => 'PlantUML version 1.2023.0') // plantuml
        .mockImplementationOnce(() => 'java version "11.0.0"') // java
        .mockImplementationOnce(() => 'Docker version 20.10.0'); // docker

      const method = await processor.determineBestMethod();

      expect(method).toBe('native');
    });

    it('should prefer java over docker when native not available', async () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('plantuml not found');
        }) // plantuml fails
        .mockImplementationOnce(() => 'java version "11.0.0"') // java succeeds
        .mockImplementationOnce(() => 'Docker version 20.10.0'); // docker succeeds

      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === '/usr/local/lib/plantuml.jar';
      });

      const method = await processor.determineBestMethod();

      expect(method).toBe('java');
    });
  });

  describe('extractPlantUMLBlocks', () => {
    it('should extract single PlantUML block', () => {
      const markdown = `
# Title

\`\`\`plantuml:diagram1
@startuml
A -> B
@enduml
\`\`\`

Some text.
`;

      const blocks = processor.extractPlantUMLBlocks(markdown);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        name: 'diagram1',
        code: '@startuml\nA -> B\n@enduml',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should extract multiple PlantUML blocks', () => {
      const markdown = `
\`\`\`plantuml:flow
@startuml
start
stop
@enduml
\`\`\`

\`\`\`plantuml:sequence
@startuml
A -> B
B -> C
@enduml
\`\`\`
`;

      const blocks = processor.extractPlantUMLBlocks(markdown);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].name).toBe('flow');
      expect(blocks[1].name).toBe('sequence');
    });

    it('should return empty array when no blocks found', () => {
      const markdown = `
# Just regular markdown

No diagrams here.
`;

      const blocks = processor.extractPlantUMLBlocks(markdown);

      expect(blocks).toHaveLength(0);
    });
  });

  describe('generateDiagram', () => {
    beforeEach(() => {
      mockExecSync.mockImplementation(() => 'PlantUML success');
      // Mock successful file generation
      mockFs.existsSync.mockImplementation((filePath) => {
        // Return true for generated output files, false for everything else
        return typeof filePath === 'string' && filePath.includes('.png');
      });
    });

    it('should generate diagram with native method', async () => {
      processor = new PlantUMLProcessor({ ...mockConfig, method: 'native' });

      const result = await processor.generateDiagram(
        '@startuml\nA -> B\n@enduml',
        '/output/diagram.png',
      );

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/output/diagram.png');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('plantuml -tpng'),
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('should generate diagram with java method', async () => {
      processor = new PlantUMLProcessor({ ...mockConfig, method: 'java' });

      // Mock JAR file exists
      mockFs.existsSync.mockImplementation((filePath) => {
        return (
          filePath === '/usr/local/lib/plantuml.jar' ||
          (typeof filePath === 'string' && filePath.includes('.png'))
        );
      });

      const result = await processor.generateDiagram(
        '@startuml\nA -> B\n@enduml',
        '/output/diagram.png',
      );

      expect(result.success).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('java -jar'),
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('should generate diagram with docker method', async () => {
      processor = new PlantUMLProcessor({ ...mockConfig, method: 'docker' });

      const result = await processor.generateDiagram(
        '@startuml\nA -> B\n@enduml',
        '/output/diagram.png',
      );

      expect(result.success).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('docker run'),
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('should handle execution failure', async () => {
      processor = new PlantUMLProcessor({ ...mockConfig, method: 'native' });
      mockExecSync.mockImplementation(() => {
        throw new Error('PlantUML execution failed');
      });

      const result = await processor.generateDiagram(
        '@startuml\nA -> B\n@enduml',
        '/output/diagram.png',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('PlantUML generation failed');
    });

    it('should return error when no method available', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });
      mockFs.existsSync.mockReturnValue(false);

      const result = await processor.generateDiagram(
        '@startuml\nA -> B\n@enduml',
        '/output/diagram.png',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No PlantUML installation method available');
    });

    it.skip('should clean up temporary files', async () => {
      processor = new PlantUMLProcessor({ ...mockConfig, method: 'native' });

      await processor.generateDiagram('@startuml\nA -> B\n@enduml', '/output/diagram.png');

      // The temporary file should be cleaned up
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('processMarkdown', () => {
    beforeEach(() => {
      // Use a processor with native method to avoid auto-detection
      processor = new PlantUMLProcessor({ ...mockConfig, method: 'native' });

      mockExecSync.mockImplementation(() => 'PlantUML success');

      // Reset existsSync for these tests
      mockFs.existsSync.mockImplementation((filePath) => {
        return typeof filePath === 'string' && filePath.includes('.png');
      });
    });

    it('should process markdown with PlantUML blocks', async () => {
      const markdown = `
# Title

\`\`\`plantuml:flow
@startuml
start
stop
@enduml
\`\`\`

Text after diagram.
`;

      const result = await processor.processMarkdown(markdown, '/assets');

      expect(result.diagrams).toHaveLength(1);
      expect(result.diagrams[0]).toEqual({
        name: 'flow',
        path: '/assets/flow.png',
        relativePath: 'assets/flow.png',
      });
      expect(result.processedMarkdown).toContain('![flow](assets/flow.png)');
      expect(result.processedMarkdown).not.toContain('plantuml:flow');
    });

    it('should handle multiple diagrams', async () => {
      const markdown = `
\`\`\`plantuml:diagram1
@startuml
A -> B
@enduml
\`\`\`

\`\`\`plantuml:diagram2
@startuml
C -> D
@enduml
\`\`\`
`;

      const result = await processor.processMarkdown(markdown, '/assets');

      expect(result.diagrams).toHaveLength(2);
      expect(result.processedMarkdown).toContain('![diagram1](assets/diagram1.png)');
      expect(result.processedMarkdown).toContain('![diagram2](assets/diagram2.png)');
    });

    it('should leave error comments for failed diagrams', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('PlantUML failed');
      });

      const markdown = `
\`\`\`plantuml:broken
@startuml
invalid syntax
@enduml
\`\`\`
`;

      const result = await processor.processMarkdown(markdown, '/assets');

      expect(result.diagrams).toHaveLength(0);
      expect(result.processedMarkdown).toContain('<!-- PlantUML Error:');
      expect(result.processedMarkdown).toContain('plantuml:broken'); // Original block preserved
    });

    it('should return unchanged markdown when no PlantUML blocks', async () => {
      const markdown = '# Just regular markdown\n\nNo diagrams here.';

      const result = await processor.processMarkdown(markdown, '/assets');

      expect(result.diagrams).toHaveLength(0);
      expect(result.processedMarkdown).toBe(markdown);
    });
  });
});
