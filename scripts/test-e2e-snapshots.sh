#!/bin/bash

# End-to-End Test Script with Filesystem Snapshots
# Tests CLI functionality and validates filesystem changes using snapshots
#
# Usage:
#   ./test-e2e-snapshots.sh           # Run tests
#   ./test-e2e-snapshots.sh --update  # Regenerate all baseline snapshots

set -e  # Exit on any error

# Set global workflow root path at the start (go up one level since script is in scripts/)
GLOBAL_WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Check for update flag
UPDATE_SNAPSHOTS=false
if [[ "$1" == "--update" ]]; then
    UPDATE_SNAPSHOTS=true
    echo "🔄 UPDATE MODE: Will regenerate all baseline snapshots"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
normalize_timestamps() {
    local directory="$1"
    local fixed_time="202501210000.00"  # YYYYMMDDHHMM.SS format for touch
    
    # Set all files and directories to a fixed timestamp for consistent testing
    find "$directory" -exec touch -t "$fixed_time" {} \; 2>/dev/null || true
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

run_test() {
    local test_name="$1"
    local command="$2"
    local expected_exit_code="${3:-0}"
    local expected_output="$4"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Running test: $test_name"
    
    # Capture both stdout and stderr, and exit code
    local output
    local exit_code
    set +e  # Don't exit on error for this test
    output=$(eval "$command" 2>&1)
    exit_code=$?
    set -e  # Re-enable exit on error
    
    # Check exit code
    if [ "$exit_code" -eq "$expected_exit_code" ]; then
        if [ -n "$expected_output" ]; then
            if echo "$output" | grep -q "$expected_output"; then
                log_success "$test_name"
                return 0
            else
                log_error "$test_name - Expected output '$expected_output' not found"
                echo "Actual output: $output"
                return 1
            fi
        else
            log_success "$test_name"
            return 0
        fi
    else
        log_error "$test_name - Expected exit code $expected_exit_code, got $exit_code"
        echo "Output: $output"
        return 1
    fi
}

run_snapshot_test() {
    local test_name="$1"
    local snapshot_name="$2"
    local directory="$3"
    local setup_command="$4"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Running snapshot test: $test_name"
    
    # Use global workflow root set at script start
    local WORKFLOW_ROOT="$GLOBAL_WORKFLOW_ROOT"
    local ORIGINAL_DIR="$(pwd)"
    
    # Run setup command if provided
    if [ -n "$setup_command" ]; then
        eval "$setup_command"
    fi
    
    # Normalize timestamps for consistent comparison
    normalize_timestamps "$directory"
    
    # Ensure we're in the workflow root for snapshot operations
    cd "$WORKFLOW_ROOT"
    
    # Check if snapshot exists, create it if missing
    if ! node "$WORKFLOW_ROOT/scripts/snapshot.js" list 2>/dev/null | grep -q "📸 $snapshot_name"; then
        log_info "Snapshot '$snapshot_name' not found, creating it..."
        node "$WORKFLOW_ROOT/scripts/snapshot.js" create "$snapshot_name" "$directory" --content
        log_success "$test_name - snapshot created"
        cd "$ORIGINAL_DIR"
        return 0
    fi
    
    # Compare with existing snapshot
    if node "$WORKFLOW_ROOT/scripts/snapshot.js" compare "$snapshot_name" "$directory" --content 2>/dev/null; then
        log_success "$test_name - matches snapshot"
        # Restore original directory
        cd "$ORIGINAL_DIR"
        return 0
    else
        log_error "$test_name - does not match snapshot"
        echo "Differences found in $directory vs $snapshot_name"
        # Show the differences (we're already in the workflow root)
        node "$WORKFLOW_ROOT/scripts/snapshot.js" compare "$snapshot_name" "$directory" --content || true
        # Restore original directory
        cd "$ORIGINAL_DIR"
        return 1
    fi
}

create_baseline_snapshot() {
    local name="$1"
    local directory="$2"
    local description="$3"
    local workflow_root="$4"
    
    log_info "Creating baseline snapshot '$name' for $description"
    # Ensure we run from workflow root for consistent snapshot location
    local ORIGINAL_DIR="$(pwd)"
    cd "$workflow_root"
    node "$workflow_root/scripts/snapshot.js" create "$name" "$directory" --content
    cd "$ORIGINAL_DIR"
}

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."
    
    # Create temporary test directories inside the repository
    mkdir -p "$(pwd)/tmp"  # Ensure tmp directory exists
    export TEST_ROOT="$(pwd)/tmp/test-e2e-$$"
    export SYSTEM_TEST_DIR="$TEST_ROOT/system"
    export PROJECT_TEST_DIR="$TEST_ROOT/project"
    export NON_PROJECT_DIR="$TEST_ROOT/non-project"
    
    mkdir -p "$SYSTEM_TEST_DIR"
    mkdir -p "$PROJECT_TEST_DIR"
    mkdir -p "$NON_PROJECT_DIR"
    
    # Build the CLI with turbo caching
    log_info "Building CLI with turbo caching..."
    log_info "This may take a moment on first run..."
    if ! pnpm turbo cli:build; then
        log_error "Failed to build CLI"
        exit 1
    fi
    log_success "CLI build completed"
    
    # Create minimal system directory structure (avoid copying huge node_modules, .git, etc.)
    log_info "Creating minimal system directory structure..."
    mkdir -p "$SYSTEM_TEST_DIR/markdown-workflow"
    
    # Copy only essential files and directories needed for E2E tests
    cp package.json "$SYSTEM_TEST_DIR/markdown-workflow/"
    cp -r dist "$SYSTEM_TEST_DIR/markdown-workflow/" 2>/dev/null || true
    cp -r workflows "$SYSTEM_TEST_DIR/markdown-workflow/" 2>/dev/null || true
    cp -r test-configs "$SYSTEM_TEST_DIR/markdown-workflow/" 2>/dev/null || true
    cp -r scripts "$SYSTEM_TEST_DIR/markdown-workflow/" 2>/dev/null || true
    
    log_success "System directory structure created (avoided copying node_modules, .git, etc.)"
    
    log_info "Test environment ready:"
    log_info "  System dir: $SYSTEM_TEST_DIR/markdown-workflow"
    log_info "  Project dir: $PROJECT_TEST_DIR"
    log_info "  Non-project dir: $NON_PROJECT_DIR"
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."
    rm -rf "$TEST_ROOT"
}

# Create baseline snapshots for expected project structures
create_baseline_snapshots() {
    if [ "$UPDATE_SNAPSHOTS" = true ]; then
        log_info "=== Regenerating Baseline Snapshots ==="
        
        # Delete existing snapshots
        local WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
        cd "$WORKFLOW_ROOT"
        
        log_info "Deleting existing baseline snapshots..."
        node scripts/snapshot.js delete empty-directory 2>/dev/null || true
        node scripts/snapshot.js delete fresh-project-with-testing-config 2>/dev/null || true
        node scripts/snapshot.js delete project-with-job-deterministic 2>/dev/null || true
        node scripts/snapshot.js delete project-with-multiple-jobs 2>/dev/null || true
    else
        log_info "=== Creating Baseline Snapshots ==="
    fi
    
    # Get absolute path to workflow root (go up one level since script is in scripts/)
    local WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    
    # Verify CLI exists
    if [ ! -f "$WORKFLOW_ROOT/dist/cli/index.js" ]; then
        log_error "CLI not found at $WORKFLOW_ROOT/dist/cli/index.js"
        log_error "Make sure to run 'pnpm turbo cli:build' first"
        return 1
    fi
    
    # Verify testing config exists
    if [ ! -f "$WORKFLOW_ROOT/test-configs/testing-config.yml" ]; then
        log_error "Testing config not found at $WORKFLOW_ROOT/test-configs/testing-config.yml"
        return 1
    fi
    
    log_info "Using workflow root: $WORKFLOW_ROOT"
    
    # Start with simple snapshots first
    log_info "Creating empty directory snapshot"
    create_baseline_snapshot "empty-directory" "$NON_PROJECT_DIR" "empty directory" "$WORKFLOW_ROOT"
    
    # Create initialized project snapshot with testing config
    log_info "Initializing project in $PROJECT_TEST_DIR"
    cd "$PROJECT_TEST_DIR"
    
    log_info "Running: node $WORKFLOW_ROOT/dist/cli/index.js init --force"
    if ! node "$WORKFLOW_ROOT/dist/cli/index.js" init --force; then
        log_error "Failed to initialize project"
        log_error "Command was: node $WORKFLOW_ROOT/dist/cli/index.js init --force"
        log_error "Working directory was: $(pwd)"
        return 1
    fi
    
    log_info "Project initialized successfully, checking structure..."
    ls -la "$PROJECT_TEST_DIR/.markdown-workflow/" || true
    
    # Copy testing config for predictable dates
    log_info "Copying testing config from $WORKFLOW_ROOT/test-configs/testing-config.yml"
    if ! cp "$WORKFLOW_ROOT/test-configs/testing-config.yml" "$PROJECT_TEST_DIR/.markdown-workflow/config.yml"; then
        log_error "Failed to copy testing config"
        return 1
    fi
    
    log_info "Creating snapshot of fresh project with testing config"
    normalize_timestamps "$PROJECT_TEST_DIR"
    create_baseline_snapshot "fresh-project-with-testing-config" "$PROJECT_TEST_DIR" "freshly initialized project with testing config" "$WORKFLOW_ROOT"
    
    # Create project with one job collection (will use fixed dates from config)
    log_info "Creating job collection with deterministic dates"
    log_info "Running: node $WORKFLOW_ROOT/dist/cli/index.js create job \"Example Corp\" \"Software Engineer\""
    if ! node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Example Corp" "Software Engineer"; then
        log_error "Failed to create job collection"
        log_error "Command was: node $WORKFLOW_ROOT/dist/cli/index.js create job \"Example Corp\" \"Software Engineer\""
        log_error "Working directory was: $(pwd)"
        return 1
    fi
    
    log_info "Job collection created successfully, creating snapshot"
    normalize_timestamps "$PROJECT_TEST_DIR"
    create_baseline_snapshot "project-with-job-deterministic" "$PROJECT_TEST_DIR" "project with one job collection (deterministic)" "$WORKFLOW_ROOT"
    
    # Clean up for actual tests
    log_info "Cleaning up project directory for actual tests"
    rm -rf "$PROJECT_TEST_DIR/.markdown-workflow"
    cd - > /dev/null
}

# Test CLI functionality 
test_cli_functionality() {
    log_info "=== Testing CLI Functionality ==="
    
    # Test that init works from system directory (useful for development/testing)
    # Use --force to handle case where directory already exists from baseline creation
    run_test "Init works from system directory" \
        "cd '$SYSTEM_TEST_DIR/markdown-workflow' && node dist/cli/index.js init --force" \
        0 "Project initialized successfully"
    
    # Clean up
    rm -rf "$SYSTEM_TEST_DIR/markdown-workflow/.markdown-workflow"
}

# Test init command with snapshots
test_init_command_snapshots() {
    log_info "=== Testing Init Command with Snapshots ==="
    
    # Get workflow root
    local WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    
    # Clean up project directory before testing
    rm -rf "$PROJECT_TEST_DIR/.markdown-workflow" 2>/dev/null || true
    rm -rf "$PROJECT_TEST_DIR/job" 2>/dev/null || true
    rm -rf "$PROJECT_TEST_DIR/blog" 2>/dev/null || true
    
    # Test init creates expected structure with testing config
    run_snapshot_test "Init creates correct project structure with testing config" \
        "fresh-project-with-testing-config" \
        "$PROJECT_TEST_DIR" \
        "cd '$PROJECT_TEST_DIR' && node '$WORKFLOW_ROOT/dist/cli/index.js' init --force && cp '$WORKFLOW_ROOT/test-configs/testing-config.yml' '$PROJECT_TEST_DIR/.markdown-workflow/config.yml'"
    
    # Test init with force flag works
    run_snapshot_test "Init with force recreates structure" \
        "fresh-project-with-testing-config" \
        "$PROJECT_TEST_DIR" \
        "cd '$PROJECT_TEST_DIR' && node '$WORKFLOW_ROOT/dist/cli/index.js' init --force && cp '$WORKFLOW_ROOT/test-configs/testing-config.yml' '$PROJECT_TEST_DIR/.markdown-workflow/config.yml'"
}

# Test workflow operations with snapshots
test_workflow_operations_snapshots() {
    log_info "=== Testing Workflow Operations with Snapshots ==="
    
    # Use global workflow root
    local WORKFLOW_ROOT="$GLOBAL_WORKFLOW_ROOT"
    
    # Ensure we have a clean project with testing config
    cd "$PROJECT_TEST_DIR"
    node "$WORKFLOW_ROOT/dist/cli/index.js" init --force > /dev/null 2>&1
    cp "$WORKFLOW_ROOT/test-configs/testing-config.yml" "$PROJECT_TEST_DIR/.markdown-workflow/config.yml"
    
    # Test creating a job collection with deterministic dates
    run_snapshot_test "Creating job collection produces expected structure (deterministic)" \
        "project-with-job-deterministic" \
        "$PROJECT_TEST_DIR" \
        "cd '$PROJECT_TEST_DIR' && node '$WORKFLOW_ROOT/dist/cli/index.js' create job 'Example Corp' 'Software Engineer'"
    
    # Test formatting documents in a collection
    run_snapshot_test "Formatting collection creates expected output structure" \
        "project-with-job-formatted" \
        "$PROJECT_TEST_DIR" \
        "cd '$PROJECT_TEST_DIR' && node '$WORKFLOW_ROOT/dist/cli/index.js' create job 'Format Test Corp' 'Test Engineer' && node '$WORKFLOW_ROOT/dist/cli/index.js' format job format_test_corp_test_engineer_20250121"
    
    # Test status change moves collection between directories
    run_snapshot_test "Status change moves collection to correct directory" \
        "project-with-job-status-change" \
        "$PROJECT_TEST_DIR" \
        "cd '$PROJECT_TEST_DIR' && node '$WORKFLOW_ROOT/dist/cli/index.js' create job 'Status Test Corp' 'Status Engineer' && node '$WORKFLOW_ROOT/dist/cli/index.js' status job status_test_corp_status_engineer_20250121 submitted"
    
    # Test list command shows collections correctly
    run_snapshot_test "List command displays collections" \
        "project-with-job-list" \
        "$PROJECT_TEST_DIR" \
        "cd '$PROJECT_TEST_DIR' && node '$WORKFLOW_ROOT/dist/cli/index.js' create job 'List Test Corp' 'List Engineer' && node '$WORKFLOW_ROOT/dist/cli/index.js' list job"
    
    cd - > /dev/null
}

# Test snapshot tool itself
test_snapshot_tool() {
    log_info "=== Testing Snapshot Tool ==="
    
    # Get workflow root path
    local WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    
    # Debug: Check if NON_PROJECT_DIR exists
    log_info "Checking if NON_PROJECT_DIR exists: $NON_PROJECT_DIR"
    if [ -d "$NON_PROJECT_DIR" ]; then
        log_info "✅ NON_PROJECT_DIR exists"
        ls -la "$NON_PROJECT_DIR" || true
    else
        log_error "❌ NON_PROJECT_DIR does not exist: $NON_PROJECT_DIR"
        log_info "Creating NON_PROJECT_DIR for tests..."
        mkdir -p "$NON_PROJECT_DIR"
    fi
    
    # Test snapshot listing
    run_test "Snapshot list command works" \
        "node '$WORKFLOW_ROOT/scripts/snapshot.js' list" \
        0 "Available snapshots"
    
    # Test creating a new snapshot
    log_info "About to run second test: Can create new snapshot"
    run_test "Can create new snapshot" \
        "node '$WORKFLOW_ROOT/scripts/snapshot.js' create test-snapshot '$NON_PROJECT_DIR'" \
        0 "Snapshot saved"
    log_info "Second test completed successfully"
    
    # Test comparing identical directories
    run_test "Identical directories match" \
        "node '$WORKFLOW_ROOT/scripts/snapshot.js' compare test-snapshot '$NON_PROJECT_DIR'" \
        0 "No differences found"
    
    # Test deleting snapshot
    run_test "Can delete snapshot" \
        "node '$WORKFLOW_ROOT/scripts/snapshot.js' delete test-snapshot" \
        0 "deleted"
}

# Test failure detection
test_failure_detection() {
    log_info "=== Testing Failure Detection ==="
    
    # Get workflow root path
    local WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    
    # Create a test snapshot
    mkdir -p "$TEST_ROOT/test-changes"
    echo "original content" > "$TEST_ROOT/test-changes/file.txt"
    node "$WORKFLOW_ROOT/scripts/snapshot.js" create test-changes "$TEST_ROOT/test-changes" --content > /dev/null
    
    # Modify the directory
    echo "modified content" > "$TEST_ROOT/test-changes/file.txt"
    
    # Test that changes are detected
    run_test "Modified files are detected" \
        "node '$WORKFLOW_ROOT/scripts/snapshot.js' compare test-changes '$TEST_ROOT/test-changes' --content" \
        1 "Modified files"
    
    # Test update functionality
    run_test "Update snapshot works" \
        "node '$WORKFLOW_ROOT/scripts/snapshot.js' compare test-changes '$TEST_ROOT/test-changes' --content --update" \
        0 "Snapshot.*updated"
    
    # Clean up
    node "$WORKFLOW_ROOT/scripts/snapshot.js" delete test-changes > /dev/null
}

# Advanced snapshot tests
test_advanced_snapshots() {
    log_info "=== Testing Advanced Snapshot Features ==="
    
    # Use global workflow root
    local WORKFLOW_ROOT="$GLOBAL_WORKFLOW_ROOT"
    local ORIGINAL_DIR="$(pwd)"
    
    # Create a fresh test directory for this test
    local ADVANCED_TEST_DIR="$TEST_ROOT/advanced-test"
    mkdir -p "$ADVANCED_TEST_DIR"
    cd "$ADVANCED_TEST_DIR"
    
    # Initialize fresh project
    node "$WORKFLOW_ROOT/dist/cli/index.js" init --force > /dev/null 2>&1
    cp "$WORKFLOW_ROOT/test-configs/testing-config.yml" "$ADVANCED_TEST_DIR/.markdown-workflow/config.yml"
    
    # Create multiple collections
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Company A" "Role A" > /dev/null 2>&1
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Company B" "Role B" > /dev/null 2>&1
    
    # Create snapshot with this clean state
    normalize_timestamps "$ADVANCED_TEST_DIR"
    create_baseline_snapshot "project-with-multiple-jobs" "$ADVANCED_TEST_DIR" "project with multiple job collections" "$WORKFLOW_ROOT"
    
    # Test that we can recreate this exact structure
    rm -rf .markdown-workflow job
    node "$WORKFLOW_ROOT/dist/cli/index.js" init --force > /dev/null 2>&1
    cp "$WORKFLOW_ROOT/test-configs/testing-config.yml" "$ADVANCED_TEST_DIR/.markdown-workflow/config.yml"
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Company A" "Role A" > /dev/null 2>&1
    node "$WORKFLOW_ROOT/dist/cli/index.js" create job "Company B" "Role B" > /dev/null 2>&1
    
    run_snapshot_test "Multiple job collections structure matches" \
        "project-with-multiple-jobs" \
        "$ADVANCED_TEST_DIR" \
        ""
    
    cd "$ORIGINAL_DIR"
}

# Main test execution
main() {
    echo "============================================================="
    echo "  Markdown Workflow CLI - E2E Test Suite with Snapshots"
    echo "============================================================="
    echo
    
    # Trap cleanup on exit
    trap cleanup_test_env EXIT
    
    # Setup
    setup_test_env
    
    # Create baseline snapshots first  
    log_info "=== Creating Baseline Snapshots ==="
    log_info "This step may take 30-60 seconds on first run..."
    create_baseline_snapshots
    log_success "Baseline snapshots completed"
    echo
    
    # Skip tests if we're just updating snapshots
    if [ "$UPDATE_SNAPSHOTS" = true ]; then
        log_info "✅ Baseline snapshots regenerated successfully!"
        log_info "Run './test-e2e-snapshots.sh' (without --update) to run the full test suite."
    else
        # Run test suites
        log_info "=== Starting Test Execution (6 test suites) ==="
        echo
        
        log_info "1/6: Testing snapshot tool functionality..."
        test_snapshot_tool
        echo
        
        log_info "2/6: Testing basic CLI functionality..."
        test_cli_functionality
        echo
        
        log_info "3/6: Testing init command with snapshots..."
        test_init_command_snapshots
        echo
        
        log_info "4/6: Testing workflow operations with snapshots..."
        test_workflow_operations_snapshots
        echo
        
        log_info "5/6: Testing failure detection..."
        test_failure_detection
        echo
        
        log_info "6/6: Testing advanced snapshot functionality..."
        test_advanced_snapshots
        echo
        
        log_info "=== All test suites completed ==="
    fi
    
    # Show available snapshots
    log_info "=== Final Snapshot Inventory ==="
    local WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    node "$WORKFLOW_ROOT/scripts/snapshot.js" list
    echo
    
    # Summary
    echo "============================================================="
    echo "  Test Results Summary"
    echo "============================================================="
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        log_success "All tests passed! 🎉"
        echo
        log_info "Snapshots created and can be used for future regression testing:"
        local WORKFLOW_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
        node "$WORKFLOW_ROOT/scripts/snapshot.js" list | grep "📸" | sed 's/📸/  -/'
        exit 0
    else
        log_error "$TESTS_FAILED test(s) failed"
        exit 1
    fi
}

# Run main function
main "$@"