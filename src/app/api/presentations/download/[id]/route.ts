import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /api/presentations/download/[id]
 * Downloads the generated PPTX file for a presentation collection
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const collectionId = params.id;
    
    if (!collectionId) {
      return NextResponse.json(
        { error: 'Collection ID is required' },
        { status: 400 }
      );
    }
    
    // Find the PPTX file
    const tempProjectDir = path.join(process.cwd(), 'tmp', 'presentation-demo');
    const collectionsDir = path.join(tempProjectDir, 'collections', 'presentation');
    const stages = ['draft', 'review', 'published'];
    
    let pptxFile = '';
    let fileName = `${collectionId}.pptx`;
    
    for (const stage of stages) {
      const formattedPath = path.join(collectionsDir, stage, collectionId, 'formatted');
      if (fs.existsSync(formattedPath)) {
        const files = fs.readdirSync(formattedPath);
        const pptxFiles = files.filter(file => file.endsWith('.pptx'));
        if (pptxFiles.length > 0) {
          pptxFile = path.join(formattedPath, pptxFiles[0]);
          fileName = pptxFiles[0]; // Use the actual filename
          break;
        }
      }
    }
    
    if (!pptxFile || !fs.existsSync(pptxFile)) {
      return NextResponse.json(
        { error: 'PPTX file not found' },
        { status: 404 }
      );
    }
    
    // Read the file
    const fileBuffer = fs.readFileSync(pptxFile);
    const fileStats = fs.statSync(pptxFile);
    
    // Return the file as a download
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileStats.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    console.error('Error downloading presentation:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}