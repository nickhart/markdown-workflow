#!/bin/bash

# Custom Workflow Test Script
# This demonstrates how to create your own snapshot-based tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# Configuration
WORKFLOW_ROOT="/Users/nickhart/Developer/markdown-workflow"
TEST_DIR="/tmp/my-workflow-test-$$"
SNAPSHOT_NAME="my-custom-workflow"

cleanup() {
    log_info "Cleaning up..."
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

main() {
    log_info "=== Custom Workflow Snapshot Test ==="
    
    # Build the project
    log_info "Building project..."
    cd "$WORKFLOW_ROOT"
    npm run build > /dev/null
    
    # Step 1: Create baseline (run this once, then comment out)
    # create_baseline_snapshot
    
    # Step 2: Test that we can reproduce the exact same structure
    test_workflow_reproduction
    
    log_success "All tests passed! 🎉"
}

create_baseline_snapshot() {
    log_info "Creating baseline snapshot with predictable dates..."
    
    # Create test project
    mkdir -p "$TEST_DIR"
    cd "$TEST_DIR"
    
    # Initialize with testing config for predictable dates
    node "$WORKFLOW_ROOT/dist/cli/index.js" init
    cp "$WORKFLOW_ROOT/test-configs/testing-config.yml" .markdown-workflow/config.yml
    
    # Create some content (will use deterministic dates from config)
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Test Company" "Senior Developer"
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Another Corp" "Tech Lead"
    
    # Take snapshot
    cd "$WORKFLOW_ROOT"
    pnpm snapshot create "$SNAPSHOT_NAME" "$TEST_DIR" --content
    
    log_success "Baseline snapshot '$SNAPSHOT_NAME' created with deterministic dates"
}

test_workflow_reproduction() {
    log_info "Testing workflow reproduction with deterministic dates..."
    
    # Clean up any existing test directory
    rm -rf "$TEST_DIR"
    mkdir -p "$TEST_DIR"
    cd "$TEST_DIR"
    
    # Reproduce the exact same steps with testing config
    node "$WORKFLOW_ROOT/dist/cli/index.js" init
    cp "$WORKFLOW_ROOT/test-configs/testing-config.yml" .markdown-workflow/config.yml
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Test Company" "Senior Developer"
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Another Corp" "Tech Lead"
    
    # Compare with snapshot
    cd "$WORKFLOW_ROOT"
    if pnpm snapshot compare "$SNAPSHOT_NAME" "$TEST_DIR" --content; then
        log_success "Workflow reproduction test passed - deterministic dates work!"
    else
        log_error "Workflow reproduction test failed"
        exit 1
    fi
}

# Run the test
main "$@"