/**
 * API client functions for the presentation demo
 */

export interface Template {
  name: string;
  displayName: string;
  content: string;
  error?: string;
}

export interface TemplatesResponse {
  templates: Template[];
  count: number;
}

export interface CreatePresentationRequest {
  title: string;
  templateName?: string;
  content?: string;
}

export interface CreatePresentationResponse {
  success: boolean;
  collectionId: string;
  stage: string;
  templateContent: string;
  message: string;
}

export interface MermaidOptions {
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
  output_format?: 'png' | 'svg';
  timeout?: number;
}

export interface FormatPresentationRequest {
  collectionId: string;
  content?: string;
  mermaidOptions?: MermaidOptions;
}

export interface FormatPresentationResponse {
  success: boolean;
  downloadUrl: string;
  message: string;
  fileSize: number;
}

export interface ApiError {
  error: string;
  message?: string;
}

/**
 * Get all available presentation templates
 */
export async function getTemplates(): Promise<TemplatesResponse> {
  const response = await fetch('/api/presentations/templates');

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch templates');
  }

  return response.json();
}

/**
 * Create a new presentation collection
 */
export async function createPresentation(
  request: CreatePresentationRequest,
): Promise<CreatePresentationResponse> {
  const response = await fetch('/api/presentations/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to create presentation');
  }

  return response.json();
}

/**
 * Format a presentation collection to PPTX
 */
export async function formatPresentation(
  request: FormatPresentationRequest,
): Promise<FormatPresentationResponse> {
  const response = await fetch('/api/presentations/format', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to format presentation');
  }

  return response.json();
}

/**
 * Download the generated PPTX file
 */
export function downloadPresentation(collectionId: string): string {
  return `/api/presentations/download/${collectionId}`;
}

/**
 * Utility to trigger file download in browser
 */
export function downloadFile(url: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
