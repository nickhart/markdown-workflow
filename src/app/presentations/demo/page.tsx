'use client';

import { useState, useEffect } from 'react';
import {
  getTemplates,
  createPresentation,
  formatPresentation,
  downloadPresentation,
  downloadFile,
  type Template,
  type MermaidOptions,
} from '@/lib/presentation-api';

type Status = 'idle' | 'loading-templates' | 'creating' | 'formatting' | 'ready' | 'error';

export default function PresentationDemo() {
  // State management
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('default');
  const [title, setTitle] = useState('Demo Presentation');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<Status>('loading-templates');
  const [error, setError] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [fileSize, setFileSize] = useState(0);

  // Mermaid configuration
  const [mermaidOptions, setMermaidOptions] = useState<MermaidOptions>({
    theme: 'default',
    output_format: 'png',
    timeout: 30,
  });

  // Load templates on component mount
  useEffect(() => {
    async function loadTemplates() {
      try {
        setStatus('loading-templates');
        const response = await getTemplates();
        setTemplates(response.templates);

        // Load default template content
        const defaultTemplate = response.templates.find((t) => t.name === 'default');
        if (defaultTemplate) {
          setContent(defaultTemplate.content);
        }

        setStatus('idle');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
        setStatus('error');
      }
    }

    loadTemplates();
  }, []);

  // Handle template selection change
  const handleTemplateChange = (templateName: string) => {
    setSelectedTemplate(templateName);
    const template = templates.find((t) => t.name === templateName);
    if (template) {
      setContent(template.content);
    }
  };

  // Status log for debugging
  const [statusLog, setStatusLog] = useState<string[]>([]);

  const addStatusLog = (message: string) => {
    setStatusLog((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Handle form submission
  const handleGenerate = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setError('');
      setStatusLog([]);
      setStatus('creating');
      addStatusLog('Starting presentation creation...');

      // Create presentation
      addStatusLog('Creating collection...');
      const createResponse = await createPresentation({
        title: title.trim(),
        templateName: selectedTemplate,
        content: content || undefined,
      });

      addStatusLog(`Collection created: ${createResponse.collectionId}`);
      setCollectionId(createResponse.collectionId);
      setStatus('formatting');

      // Small delay to ensure collection is fully written
      addStatusLog('Waiting for collection to be ready...');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Format to PPTX
      addStatusLog('Processing diagrams and formatting to PPTX...');
      const formatResponse = await formatPresentation({
        collectionId: createResponse.collectionId,
        content: content,
        mermaidOptions,
      });

      addStatusLog('PPTX generation complete!');
      setDownloadUrl(formatResponse.downloadUrl);
      setFileSize(formatResponse.fileSize);
      setStatus('ready');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      addStatusLog(`Error: ${errorMessage}`);
      setError(errorMessage);
      setStatus('error');
    }
  };

  // Handle file download
  const handleDownload = () => {
    if (downloadUrl) {
      const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pptx`;
      downloadFile(downloadUrl, filename);
    }
  };

  // Reset for new presentation
  const handleReset = () => {
    setStatus('idle');
    setError('');
    setCollectionId('');
    setDownloadUrl('');
    setFileSize(0);
    const template = templates.find((t) => t.name === selectedTemplate);
    if (template) {
      setContent(template.content);
    }
  };

  // Status messages
  const getStatusMessage = () => {
    switch (status) {
      case 'loading-templates':
        return '⏳ Loading templates...';
      case 'creating':
        return '⏳ Creating presentation collection...';
      case 'formatting':
        return '🔄 Processing diagrams and generating PPTX... (this may take 30-60 seconds)';
      case 'ready':
        return '✅ Presentation ready for download!';
      case 'error':
        return `❌ Error: ${error}`;
      default:
        return 'Ready to generate presentation';
    }
  };

  const isProcessing =
    status === 'loading-templates' || status === 'creating' || status === 'formatting';

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Presentation Generator Demo</h1>
        <p className="text-gray-600">
          Create professional presentations with Mermaid diagrams and export to PPTX
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Presentation Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter presentation title"
              disabled={isProcessing}
            />
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isProcessing}
            >
              {templates.map((template) => (
                <option key={template.name} value={template.name}>
                  {template.displayName}
                  {template.error && ' (Error loading)'}
                </option>
              ))}
            </select>
            {templates.length === 0 && status !== 'loading-templates' && (
              <p className="text-sm text-red-600 mt-1">No templates available</p>
            )}
          </div>

          {/* Content Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Presentation Content (Markdown)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-96 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="Loading template content..."
              disabled={isProcessing}
            />
            <p className="text-sm text-gray-500 mt-1">
              Use Mermaid diagrams with syntax: <code>```mermaid:diagram-name</code>
            </p>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isProcessing || !title.trim() || status === 'ready'}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-md transition-colors"
          >
            {status === 'ready' ? 'Generate Another Presentation' : 'Generate Presentation'}
          </button>

          {status === 'ready' && (
            <button
              onClick={handleReset}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
            >
              Start New Presentation
            </button>
          )}
        </div>

        {/* Right Column: Status & Configuration */}
        <div className="space-y-6">
          {/* Status Panel */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Status</h3>
            <div className="text-sm text-gray-700 mb-3">{getStatusMessage()}</div>
            {isProcessing && (
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full animate-pulse"
                    style={{ width: '70%' }}
                  ></div>
                </div>
              </div>
            )}

            {/* Status Log */}
            {statusLog.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium text-gray-600 mb-2">Activity Log:</div>
                <div className="bg-gray-50 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                  {statusLog.map((log, index) => (
                    <div key={index} className="text-gray-600">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Download Panel */}
          {status === 'ready' && downloadUrl && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-3">Download Ready</h3>
              <div className="space-y-3">
                <div className="text-sm text-green-700">
                  <div>
                    Collection ID: <code className="text-xs">{collectionId}</code>
                  </div>
                  <div>File Size: {(fileSize / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  onClick={handleDownload}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                >
                  📥 Download PPTX
                </button>
              </div>
            </div>
          )}

          {/* Configuration Panel */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Mermaid Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Theme</label>
                <select
                  value={mermaidOptions.theme}
                  onChange={(e) =>
                    setMermaidOptions({
                      ...mermaidOptions,
                      theme: e.target.value as MermaidOptions['theme'],
                    })
                  }
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isProcessing}
                >
                  <option value="default">Default</option>
                  <option value="dark">Dark</option>
                  <option value="forest">Forest</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Output Format
                </label>
                <select
                  value={mermaidOptions.output_format}
                  onChange={(e) =>
                    setMermaidOptions({
                      ...mermaidOptions,
                      output_format: e.target.value as MermaidOptions['output_format'],
                    })
                  }
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isProcessing}
                >
                  <option value="png">PNG</option>
                  <option value="svg">SVG</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Timeout (seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={mermaidOptions.timeout}
                  onChange={(e) =>
                    setMermaidOptions({
                      ...mermaidOptions,
                      timeout: parseInt(e.target.value) || 30,
                    })
                  }
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isProcessing}
                />
              </div>
            </div>
          </div>

          {/* Info Panel */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">How It Works</h3>
            <div className="text-sm text-blue-800 space-y-2">
              <div>1. Choose a template and edit content</div>
              <div>2. Add Mermaid diagrams for visuals</div>
              <div>3. Click generate to create PPTX</div>
              <div>4. Download your presentation</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
