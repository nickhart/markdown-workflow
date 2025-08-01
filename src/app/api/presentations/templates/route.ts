import { NextRequest, NextResponse } from 'next/server';
import { ConfigDiscovery } from '@/core/config-discovery';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /api/presentations/templates
 * Returns available presentation templates with their content
 */
export async function GET(request: NextRequest) {
  try {
    const configDiscovery = new ConfigDiscovery();
    const systemConfig = configDiscovery.discoverSystemConfiguration();
    
    // Get presentation workflow templates
    const presentationWorkflowPath = path.join(systemConfig.systemRoot, 'workflows', 'presentation');
    const templatesPath = path.join(presentationWorkflowPath, 'templates', 'content');
    
    if (!fs.existsSync(templatesPath)) {
      return NextResponse.json(
        { error: 'Presentation templates not found' },
        { status: 404 }
      );
    }
    
    // Read available template files
    const templateFiles = fs.readdirSync(templatesPath)
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace('.md', ''));
    
    // Load content for each template
    const templates = templateFiles.map(templateName => {
      try {
        const templatePath = path.join(templatesPath, `${templateName}.md`);
        const content = fs.readFileSync(templatePath, 'utf-8');
        
        return {
          name: templateName,
          displayName: templateName.charAt(0).toUpperCase() + templateName.slice(1),
          content
        };
      } catch (error) {
        console.error(`Error reading template ${templateName}:`, error);
        return {
          name: templateName,
          displayName: templateName.charAt(0).toUpperCase() + templateName.slice(1),
          content: `# ${templateName} Template\n\nTemplate content could not be loaded.`,
          error: 'Failed to load template content'
        };
      }
    });
    
    return NextResponse.json({
      templates,
      count: templates.length
    });
    
  } catch (error) {
    console.error('Error fetching presentation templates:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}