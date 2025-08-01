import { NextRequest, NextResponse } from 'next/server';
import { WorkflowEngine } from '@/core/workflow-engine';
import { ConfigDiscovery } from '@/core/config-discovery';
import * as fs from 'fs';
import * as path from 'path';
import { validateInput, createPresentationSchema, type CreatePresentationInput } from '@/lib/input-validation';
import { executeWithResourceLimits } from '@/lib/resource-monitor';

/**
 * POST /api/presentations/create
 * Creates a new presentation collection using the WorkflowEngine
 */
export async function POST(request: NextRequest) {
  const processId = `create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  try {
    // Parse and validate input
    const rawBody = await request.json();
    const validation = validateInput(createPresentationSchema, rawBody);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          message: validation.error 
        }, 
        { status: 400 }
      );
    }

    const body: CreatePresentationInput = validation.data;

    // Execute with resource limits and monitoring
    const result = await executeWithResourceLimits(
      processId,
      'create',
      clientIP,
      async () => {
        // Initialize WorkflowEngine
        const configDiscovery = new ConfigDiscovery();
        const _systemConfig = configDiscovery.discoverSystemConfiguration();

        // Create a temporary project directory for the demo
        // In a real app, this would be user-specific
        const tempProjectDir = path.join(process.cwd(), 'tmp', 'presentation-demo');
        if (!fs.existsSync(tempProjectDir)) {
          fs.mkdirSync(tempProjectDir, { recursive: true });
        }

        // Initialize project if needed
        const projectMarker = path.join(tempProjectDir, '.markdown-workflow');
        if (!fs.existsSync(projectMarker)) {
          fs.mkdirSync(projectMarker, { recursive: true });

          // Create minimal config
          const configPath = path.join(projectMarker, 'config.yml');
          const minimalConfig = `
user:
  name: "Demo User"  
  email: "demo@example.com"

system:
  mermaid:
    output_format: "png"
    theme: "default"
    timeout: 30
`;
          fs.writeFileSync(configPath, minimalConfig);
        }

        // Import the create command directly
        const { createCommand } = await import('@/cli/commands/create');

        // Create the presentation collection using the CLI command
        await createCommand('presentation', body.title, {
          template_variant: body.templateName,
          cwd: tempProjectDir,
          configDiscovery,
          force: true, // Always force recreate for the demo
        });

        return { tempProjectDir, configDiscovery };
      },
      `create presentation '${body.title}'`
    );

    // Find the created collection by looking for the most recent one
    const workflowEngine = new WorkflowEngine(result.tempProjectDir);
    const collections = await workflowEngine.getCollections('presentation');

    // Find the collection that matches our title (most recent should be first)
    const createdCollection =
      collections.find(
        (c) =>
          c.metadata.title === body.title ||
          c.metadata.collection_id.includes(body.title.toLowerCase().replace(/[^a-z0-9]/g, '_')),
      ) || collections[0]; // Fallback to most recent

    if (!createdCollection) {
      return NextResponse.json(
        { error: 'Collection was created but could not be found' },
        { status: 500 },
      );
    }

    const collectionId = createdCollection.metadata.collection_id;
    const stage = createdCollection.metadata.status;

    console.log(`Created collection: ${collectionId} in stage: ${stage}`);

    // If custom content is provided, update the content.md file
    if (body.content) {
      try {
        const contentPath = path.join(
          result.tempProjectDir,
          'collections',
          'presentation',
          stage,
          collectionId,
          'content.md',
        );
        if (fs.existsSync(contentPath)) {
          fs.writeFileSync(contentPath, body.content);
        }
      } catch (error) {
        console.warn('Failed to update content with custom text:', error);
        // Don't fail the whole request for this
      }
    }

    // Get the template content that was used
    let templateContent = '';
    try {
      const contentPath = path.join(
        result.tempProjectDir,
        'collections',
        'presentation',
        stage,
        collectionId,
        'content.md',
      );
      if (fs.existsSync(contentPath)) {
        templateContent = fs.readFileSync(contentPath, 'utf-8');
      }
    } catch (error) {
      console.warn('Failed to read generated content:', error);
    }

    return NextResponse.json({
      success: true,
      collectionId,
      stage,
      templateContent,
      message: 'Presentation created successfully',
    });
  } catch (error) {
    console.error(`Error creating presentation (Process: ${processId}, IP: ${clientIP}):`, error);
    
    // Sanitize error message for security
    let sanitizedMessage = 'Failed to create presentation';
    
    if (error instanceof Error) {
      // Only expose certain types of errors to the client
      if (error.message.includes('Resource limits exceeded') || 
          error.message.includes('timed out') ||
          error.message.includes('Validation failed')) {
        sanitizedMessage = error.message;
      } else if (error.message.includes('ENOSPC')) {
        sanitizedMessage = 'Insufficient disk space. Please try again later.';
      } else if (error.message.includes('ENOMEM')) {
        sanitizedMessage = 'System memory full. Please try again later.';
      }
    }
    
    return NextResponse.json(
      {
        error: 'Creation failed',
        message: sanitizedMessage,
      },
      { status: 500 },
    );
  }
}
