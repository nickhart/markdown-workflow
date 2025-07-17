#!/bin/bash

# Markdown Workflow Setup Script
# Builds the CLI and makes it available globally

set -e

echo "🔧 Setting up markdown-workflow..."

# Check if we're in the right directory
if [ ! -f "package.json" ] || ! grep -q "markdown-workflow" package.json; then
    echo "❌ Error: Run this script from the markdown-workflow project directory"
    exit 1
fi

# Check for required dependencies
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: pnpm is required but not installed"
    echo "Install with: npm install -g pnpm"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build the CLI
echo "🔨 Building CLI..."
pnpm run cli:build

# Check if built successfully
if [ ! -f "dist/cli/index.js" ]; then
    echo "❌ Error: CLI build failed - dist/cli/index.js not found"
    ls -la dist/ || echo "dist/ directory not found"
    exit 1
fi

# Make the CLI executable
chmod +x dist/cli/index.js

# Option 1: Try to link globally (recommended)
echo "🔗 Linking globally..."
if pnpm link --global; then
    echo "✅ Successfully linked 'wf' command globally!"
    echo ""
    echo "You can now use 'wf' from anywhere:"
    echo "  wf init"
    echo "  wf --help"
    echo ""
    echo "If the command isn't found, try:"
    echo "  source ~/.zshrc  # or ~/.bashrc"
    echo ""
else
    echo "⚠️  Global linking failed. Setting up PATH alternative..."
    
    # Option 2: Add to PATH
    PROJECT_DIR="$(pwd)"
    BIN_DIR="$PROJECT_DIR/dist/cli"
    
    # Create a wrapper script in a common location
    mkdir -p "$HOME/.local/bin"
    cat > "$HOME/.local/bin/wf" << EOF
#!/bin/bash
node "$BIN_DIR/index.js" "\$@"
EOF
    chmod +x "$HOME/.local/bin/wf"
    
    # Check if ~/.local/bin is in PATH
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo ""
        echo "📝 Add this to your ~/.zshrc or ~/.bashrc:"
        echo "export PATH=\"\$PATH:\$HOME/.local/bin\""
        echo ""
        echo "Then reload your shell:"
        echo "source ~/.zshrc"
        echo ""
    fi
    
    echo "✅ Created 'wf' command in ~/.local/bin/wf"
fi

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Navigate to your writing project directory"
echo "2. Run: wf init"
echo "3. Edit .markdown-workflow/config.yml with your information"
echo "4. Start creating collections with wf-create (coming soon!)"