# Presentation API - Postman Collection

This Postman collection provides comprehensive testing for the Presentation API endpoints.

## Setup

1. **Import Collection**: Import `presentation-demo.json` into Postman
2. **Set Environment**: Create environment with the following variables:
   - `baseUrl`: `http://localhost:3000` (for local development)
   - `collectionId`: Leave empty (auto-populated by tests)

## API Endpoints

### 1. GET /api/presentations/templates
**Purpose**: Retrieve available presentation templates  
**Tests**: Validates response structure and template properties

### 2. POST /api/presentations/create
**Purpose**: Create a new presentation collection  
**Body**: 
```json
{
  "title": "API Test Presentation",
  "templateName": "default"
}
```
**Tests**: Validates collection creation and auto-captures `collectionId`

### 3. POST /api/presentations/format
**Purpose**: Format presentation to PPTX with custom content  
**Body**:
```json
{
  "collectionId": "{{collectionId}}",
  "content": "# Custom markdown content...",
  "mermaidOptions": {
    "theme": "default",
    "output_format": "png",
    "timeout": 30
  }
}
```
**Tests**: Validates formatting success and download URL

### 4. GET /api/presentations/download/{id}
**Purpose**: Download the generated PPTX file  
**Tests**: Validates file download headers and content type

## Running Tests

### Individual Requests
Run requests in sequence (1 → 2 → 3 → 4) for full workflow testing.

### Collection Runner
1. Click "Run Collection" 
2. Select all requests
3. Run with 1-2 second delay between requests
4. All tests should pass for successful API functionality

## Environment Variables

### Local Development
```
baseUrl: http://localhost:3000
collectionId: (auto-populated)
```

### Production (Railway)
```
baseUrl: https://your-app.railway.app
collectionId: (auto-populated)
```

## Expected Results

- **Templates**: Should return at least `default` and `beginner` templates
- **Create**: Returns collection ID like `api_test_presentation_20250801`
- **Format**: Processing time varies (30s-2min depending on diagrams)
- **Download**: PPTX file typically 50KB-500KB depending on content

## Troubleshooting

### Common Issues

**404 on templates**: Check that presentation workflow exists in `workflows/presentation/`

**500 on create**: Verify WorkflowEngine can write to temp directory

**Timeout on format**: Mermaid CLI or pandoc may not be installed

**404 on download**: File may not have been generated successfully

### Debug Tips

1. Check server logs for detailed error messages
2. Verify temp directory has proper write permissions
3. Test individual components (Mermaid CLI, pandoc) separately
4. Use environment variables to switch between local/production testing

## Test Data

The collection includes realistic test data:
- Professional presentation title
- Custom markdown content with Mermaid diagrams
- Standard Mermaid configuration options
- Proper MIME types and headers

## Integration Testing

This collection can be used for:
- **Development**: Quick API validation during development
- **CI/CD**: Automated testing in deployment pipelines  
- **Documentation**: Living API examples and expected responses
- **Debugging**: Isolate backend issues from frontend problems