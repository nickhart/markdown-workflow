# Presentation Demo - Deployment Guide

## Railway Deployment

### Prerequisites

- Railway account (railway.app)
- GitHub repository connected to Railway

### Deployment Steps

1. **Connect Repository**

   ```bash
   # Install Railway CLI (optional)
   npm install -g @railway/cli
   railway login
   ```

2. **Create New Project**
   - Go to railway.app
   - Click "New Project"
   - Choose "Deploy from GitHub repo"
   - Select your repository

3. **Configure Environment**
   Railway will automatically:
   - Detect the Dockerfile
   - Build with system dependencies (pandoc, chromium)
   - Install Mermaid CLI
   - Expose port 3000

4. **Custom Domain (Optional)**
   - Go to project settings
   - Add custom domain
   - Update Postman environment variable

### Environment Variables

No additional environment variables required for basic functionality.

Optional configurations:

- `NODE_ENV=production` (auto-set by Railway)
- `PORT=3000` (auto-set by Railway)

### Build Process

The Dockerfile handles:

- Installing pandoc for document conversion
- Installing Chromium for Mermaid diagram generation
- Installing Mermaid CLI globally
- Building Next.js application
- Setting up proper permissions

### Monitoring

- Railway provides automatic logs
- Health check endpoint: `/api/presentations/templates`
- Monitor build logs for any dependency issues

### Troubleshooting

**Build Failures:**

- Check Dockerfile syntax
- Verify all dependencies are available in Alpine Linux
- Check build logs for specific error messages

**Runtime Issues:**

- Verify Mermaid CLI can access Chromium
- Check file permissions for temp directory
- Monitor memory usage (Railway has limits per plan)

**API Issues:**

- Test endpoints with Postman collection
- Check server logs in Railway dashboard
- Verify all presentation templates are accessible

### Local Testing

Before deploying, test the Docker build locally:

```bash
# Build the image
docker build -t presentation-demo .

# Run locally
docker run -p 3000:3000 presentation-demo

# Test endpoints
curl http://localhost:3000/api/presentations/templates
```

### Performance Considerations

- PPTX generation can take 30-60 seconds
- Mermaid diagram rendering requires Chromium (memory intensive)
- Consider Railway Pro plan for production use
- File cleanup happens automatically (temp directory is ephemeral)

### Security

- Application runs as non-root user
- Temp files are isolated per container
- No persistent storage of user data
- All generated files are cleaned up on container restart
