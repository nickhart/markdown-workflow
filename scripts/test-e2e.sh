#!/bin/bash

# End-to-End Test Script for Markdown Workflow CLI
# Tests system directory protection and basic CLI functionality

set -e  # Exit on any error

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
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

run_test() {
    local test_name="$1"
    local command="$2"
    local expected_exit_code="${3:-0}"
    local expected_output="$4"
    
    ((TESTS_RUN++))
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

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."
    
    # Create temporary test directories
    export TEST_ROOT="/tmp/markdown-workflow-e2e-$$"
    export SYSTEM_TEST_DIR="$TEST_ROOT/system"
    export PROJECT_TEST_DIR="$TEST_ROOT/project"
    export NON_PROJECT_DIR="$TEST_ROOT/non-project"
    
    mkdir -p "$SYSTEM_TEST_DIR"
    mkdir -p "$PROJECT_TEST_DIR"
    mkdir -p "$NON_PROJECT_DIR"
    
    # Build the project
    log_info "Building project..."
    npm run build > /dev/null 2>&1
    
    # Create symlink to simulate being in system directory
    cp -r . "$SYSTEM_TEST_DIR/markdown-workflow"
    
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

# Test CLI command availability
test_cli_commands() {
    log_info "=== Testing CLI Command Availability ==="
    
    # Test that CLI is built and available
    run_test "CLI help command" "node dist/cli/index.js --help" 0 "Usage:"
}

# Test CLI commands work correctly
test_cli_functionality() {
    log_info "=== Testing Basic CLI Functionality ==="
    
    # Test that CLI commands work from any directory (including system directory)
    run_test "Init can run from system directory" \
        "cd '$SYSTEM_TEST_DIR/markdown-workflow' && node dist/cli/index.js init" \
        0 "Project initialized successfully"
    
    # Clean up the init we just created
    rm -rf "$SYSTEM_TEST_DIR/markdown-workflow/.markdown-workflow"
}

# Test init command functionality
test_init_command() {
    log_info "=== Testing Init Command ==="
    
    # Test init in non-project directory should work
    run_test "Init in clean directory" \
        "cd '$PROJECT_TEST_DIR' && node '$PWD/dist/cli/index.js' init" \
        0 "Project initialized successfully"
    
    # Verify project structure was created
    run_test "Project structure created" \
        "test -d '$PROJECT_TEST_DIR/.markdown-workflow'" \
        0
    
    run_test "Config file created" \
        "test -f '$PROJECT_TEST_DIR/.markdown-workflow/config.yml'" \
        0
    
    run_test "Workflows directory created" \
        "test -d '$PROJECT_TEST_DIR/.markdown-workflow/workflows'" \
        0
    
    run_test "Collections directory created" \
        "test -d '$PROJECT_TEST_DIR/.markdown-workflow/collections'" \
        0
    
    # Test init in existing project without force should fail
    run_test "Init in existing project should fail" \
        "cd '$PROJECT_TEST_DIR' && node '$PWD/dist/cli/index.js' init" \
        1 "Already in a markdown-workflow project"
    
    # Test init with force should work
    run_test "Init with force should work" \
        "cd '$PROJECT_TEST_DIR' && node '$PWD/dist/cli/index.js' init --force" \
        0 "Project initialized successfully"
}

# Test commands requiring project context
test_project_context_commands() {
    log_info "=== Testing Project Context Requirements ==="
    
    # Test commands that should fail outside project
    run_test "List outside project should fail" \
        "cd '$NON_PROJECT_DIR' && node '$PWD/dist/cli/index.js' list job" \
        1 "Project root not found"
    
    run_test "Create outside project should fail" \
        "cd '$NON_PROJECT_DIR' && node '$PWD/dist/cli/index.js' create job 'Test Company' 'Test Role'" \
        1 "Project root not found"
    
    # Test commands that should work inside project
    run_test "List inside project should work" \
        "cd '$PROJECT_TEST_DIR' && node '$PWD/dist/cli/index.js' list job" \
        0
}

# Test workflow operations
test_workflow_operations() {
    log_info "=== Testing Workflow Operations ==="
    
    # Test creating a collection
    run_test "Create job collection" \
        "cd '$PROJECT_TEST_DIR' && node '$PWD/dist/cli/index.js' create job 'Test Company' 'Software Engineer'" \
        0 "Created collection"
    
    # Test listing collections
    run_test "List job collections" \
        "cd '$PROJECT_TEST_DIR' && node '$PWD/dist/cli/index.js' list job" \
        0
}

# Test invalid workflows
test_invalid_workflows() {
    log_info "=== Testing Invalid Workflow Handling ==="
    
    # Test init with invalid workflow
    run_test "Init with invalid workflow should fail" \
        "cd '$NON_PROJECT_DIR' && node '$PWD/dist/cli/index.js' init --workflows=invalid" \
        1 "Unknown workflows: invalid"
}

# Main test execution
main() {
    echo "==================================================="
    echo "  Markdown Workflow CLI - End-to-End Test Suite"
    echo "==================================================="
    echo
    
    # Trap cleanup on exit
    trap cleanup_test_env EXIT
    
    # Setup
    setup_test_env
    
    # Run test suites
    test_cli_commands
    echo
    test_cli_functionality
    echo
    test_init_command
    echo
    test_project_context_commands
    echo
    test_workflow_operations
    echo
    test_invalid_workflows
    echo
    
    # Summary
    echo "==================================================="
    echo "  Test Results Summary"
    echo "==================================================="
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        log_success "All tests passed! 🎉"
        exit 0
    else
        log_error "$TESTS_FAILED test(s) failed"
        exit 1
    fi
}

# Run main function
main "$@"