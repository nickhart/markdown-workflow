import { NextRequest, NextResponse } from 'next/server';
import { WorkflowEngine } from '@/core/workflow-engine';
import { ConfigDiscovery } from '@/core/config-discovery';
import * as fs from 'fs';
import * as path from 'path';

interface CreatePresentationRequest {
  title: string;
  templateName?: string;
  content?: string;
}

/**
 * POST /api/presentations/create
 * Creates a new presentation collection using the WorkflowEngine
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreatePresentationRequest = await request.json();
    
    if (!body.title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }
    
    const templateName = body.templateName || 'default';
    
    // Initialize WorkflowEngine
    const configDiscovery = new ConfigDiscovery();
    const systemConfig = configDiscovery.discoverSystemConfiguration();
    
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
      template_variant: templateName,
      cwd: tempProjectDir,
      configDiscovery,
      force: true  // Always force recreate for the demo
    });
    
    // Find the created collection by looking for the most recent one
    const workflowEngine = new WorkflowEngine(tempProjectDir);
    const collections = await workflowEngine.getCollections('presentation');
    
    // Find the collection that matches our title (most recent should be first)
    const createdCollection = collections.find(c => 
      c.metadata.title === body.title || 
      c.metadata.collection_id.includes(body.title.toLowerCase().replace(/[^a-z0-9]/g, '_'))
    ) || collections[0]; // Fallback to most recent
    
    if (!createdCollection) {
      return NextResponse.json(
        { error: 'Collection was created but could not be found' },
        { status: 500 }
      );
    }
    
    const collectionId = createdCollection.metadata.collection_id;
    const stage = createdCollection.metadata.status;
    
    console.log(`Created collection: ${collectionId} in stage: ${stage}`);
    
    // If custom content is provided, update the content.md file
    if (body.content) {
      try {
        const contentPath = path.join(tempProjectDir, 'collections', 'presentation', stage, collectionId, 'content.md');
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
      const contentPath = path.join(tempProjectDir, 'collections', 'presentation', stage, collectionId, 'content.md');
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
      message: 'Presentation created successfully'
    });
    
  } catch (error) {
    console.error('Error creating presentation:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}