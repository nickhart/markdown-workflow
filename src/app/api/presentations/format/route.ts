import { NextRequest, NextResponse } from 'next/server';
import { WorkflowEngine } from '@/core/workflow-engine';
import { ConfigDiscovery } from '@/core/config-discovery';
import * as fs from 'fs';
import * as path from 'path';

interface FormatPresentationRequest {
  collectionId: string;
  content?: string;
  mermaidOptions?: {
    theme?: 'default' | 'dark' | 'forest' | 'neutral';
    output_format?: 'png' | 'svg';
    timeout?: number;
  };
}

/**
 * POST /api/presentations/format
 * Formats a presentation collection to PPTX using the WorkflowEngine
 */
export async function POST(request: NextRequest) {
  try {
    const body: FormatPresentationRequest = await request.json();

    if (!body.collectionId) {
      return NextResponse.json({ error: 'Collection ID is required' }, { status: 400 });
    }

    // The CLI creates collections in a flat structure, but WorkflowEngine expects nested
    // So we need to point WorkflowEngine to the parent directory of where CLI creates them
    const tempProjectDir = path.join(process.cwd(), 'tmp', 'presentation-demo');

    // Create the expected directory structure by moving/symlinking if needed
    const cliCollectionsDir = path.join(tempProjectDir, 'presentation');
    const expectedCollectionsDir = path.join(tempProjectDir, 'collections', 'presentation');

    if (fs.existsSync(cliCollectionsDir) && !fs.existsSync(expectedCollectionsDir)) {
      // Create the expected parent directory
      fs.mkdirSync(path.dirname(expectedCollectionsDir), { recursive: true });
      // Create a symlink so WorkflowEngine can find the collections
      fs.symlinkSync(cliCollectionsDir, expectedCollectionsDir);
    }

    // Use the same ConfigDiscovery approach as the create endpoint
    const configDiscovery = new ConfigDiscovery();
    const workflowEngine = new WorkflowEngine(tempProjectDir, configDiscovery);

    console.log(`Looking for collection: ${body.collectionId}`);
    console.log(`Project directory: ${tempProjectDir}`);

    // Debug: check both possible directory structures
    const collectionsDir1 = path.join(tempProjectDir, 'collections', 'presentation');
    const collectionsDir2 = path.join(tempProjectDir, 'presentation');

    console.log(`Collections directory (v1) exists: ${fs.existsSync(collectionsDir1)}`);
    console.log(`Collections directory (v2) exists: ${fs.existsSync(collectionsDir2)}`);

    const collectionsDir = fs.existsSync(collectionsDir2) ? collectionsDir2 : collectionsDir1;
    console.log(`Using collections directory: ${collectionsDir}`);

    if (fs.existsSync(collectionsDir)) {
      const stages = fs.readdirSync(collectionsDir);
      console.log(`Available stages: ${stages.join(', ')}`);
      for (const stage of stages) {
        const stageDir = path.join(collectionsDir, stage);
        if (fs.existsSync(stageDir)) {
          const collections = fs.readdirSync(stageDir);
          console.log(`Collections in ${stage}: ${collections.join(', ')}`);
        }
      }
    }

    // Check if collection exists first
    const collection = await workflowEngine.getCollection('presentation', body.collectionId);
    if (!collection) {
      // Try to list all collections to debug
      const allCollections = await workflowEngine.getCollections('presentation');
      console.log(
        'Available collections via WorkflowEngine:',
        allCollections.map((c) => c.metadata.collection_id),
      );

      return NextResponse.json(
        {
          error: 'Collection not found',
          message: `Collection '${body.collectionId}' not found. Available: ${allCollections.map((c) => c.metadata.collection_id).join(', ')}`,
        },
        { status: 404 },
      );
    }

    // Update content if provided
    if (body.content) {
      try {
        // Find the collection directory
        const collectionsDir = path.join(tempProjectDir, 'collections', 'presentation');
        const stages = ['draft', 'review', 'published'];

        let collectionPath = '';
        for (const stage of stages) {
          const stagePath = path.join(collectionsDir, stage, body.collectionId);
          if (fs.existsSync(stagePath)) {
            collectionPath = stagePath;
            break;
          }
        }

        if (!collectionPath) {
          return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
        }

        // Update the content.md file
        const contentPath = path.join(collectionPath, 'content.md');
        fs.writeFileSync(contentPath, body.content);
      } catch (error) {
        console.error('Error updating content:', error);
        return NextResponse.json(
          {
            error: 'Failed to update content',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 },
        );
      }
    }

    // Format the collection to PPTX using executeAction
    await workflowEngine.executeAction('presentation', body.collectionId, 'format', {
      format: 'pptx', // Single format, not array
      mermaidConfig: body.mermaidOptions
        ? {
            output_format: body.mermaidOptions.output_format || 'png',
            theme: body.mermaidOptions.theme || 'default',
            timeout: body.mermaidOptions.timeout || 30,
          }
        : undefined,
    });

    // executeAction throws on error, so if we get here it succeeded

    // Find the generated PPTX file
    const formattedDir = path.join(tempProjectDir, 'collections', 'presentation');
    const stages = ['draft', 'review', 'published'];

    let pptxFile = '';
    for (const stage of stages) {
      const formattedPath = path.join(formattedDir, stage, body.collectionId, 'formatted');
      if (fs.existsSync(formattedPath)) {
        const files = fs.readdirSync(formattedPath);
        const pptxFiles = files.filter((file) => file.endsWith('.pptx') || file.endsWith('.docx')); // Accept both for now
        if (pptxFiles.length > 0) {
          pptxFile = path.join(formattedPath, pptxFiles[0]);
          break;
        }
      }
    }

    if (!pptxFile || !fs.existsSync(pptxFile)) {
      return NextResponse.json(
        {
          error: 'PPTX file not found after formatting',
          message: 'File may not have been generated successfully',
        },
        { status: 500 },
      );
    }

    // Generate download URL
    const downloadUrl = `/api/presentations/download/${body.collectionId}`;

    return NextResponse.json({
      success: true,
      downloadUrl,
      message: 'Presentation formatted successfully',
      fileSize: fs.statSync(pptxFile).size,
    });
  } catch (error) {
    console.error('Error formatting presentation:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
