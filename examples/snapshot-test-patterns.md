# Snapshot Test Patterns

This document shows common patterns for creating snapshot-based tests for the markdown-workflow CLI.

## 🎯 **Pattern 1: Single Command Validation**

Test that a single CLI command produces the expected file structure.

```bash
#!/bin/bash
# Test: init command creates correct structure

TEST_DIR="/tmp/init-test-$$"
mkdir -p "$TEST_DIR" && cd "$TEST_DIR"

# Run command
wf-init

# Validate with snapshot
pnpm snapshot compare "expected-init-structure" "$TEST_DIR"
```

## 🎯 **Pattern 2: Workflow Sequence Testing**

Test a complete workflow from start to finish.

```bash
#!/bin/bash
# Test: Complete job application workflow

TEST_DIR="/tmp/job-workflow-$$"
mkdir -p "$TEST_DIR" && cd "$TEST_DIR"

# Initialize
wf-init
cp ../test-configs/testing-config.yml .markdown-workflow/config.yml

# Create application
wf-create job "Acme Corp" "Software Engineer"

# Update status
wf-status job acme_corp_software_engineer_20250121 submitted

# Create notes
wf-notes job acme_corp_software_engineer_20250121 recruiter

# Validate final state
pnpm snapshot compare "complete-job-workflow" "$TEST_DIR" --content
```

## 🎯 **Pattern 3: Template Customization Testing**

Test that custom templates work correctly.

```bash
#!/bin/bash
# Test: Custom template produces expected output

TEST_DIR="/tmp/template-test-$$"
mkdir -p "$TEST_DIR" && cd "$TEST_DIR"

# Setup with custom templates
wf-init
cp ../test-configs/testing-config.yml .markdown-workflow/config.yml

# Add custom template
mkdir -p .markdown-workflow/workflows/job/templates/resume
echo "# Custom Resume for {{user.name}}" > .markdown-workflow/workflows/job/templates/resume/custom.md

# Create with custom template
wf-create job "Test Co" "Developer" --template custom

# Validate
pnpm snapshot compare "custom-template-output" "$TEST_DIR" --content
```

## 🎯 **Pattern 4: Error Condition Testing**

Test that error conditions produce expected messages and don't corrupt state.

```bash
#!/bin/bash
# Test: Invalid status transition handling

TEST_DIR="/tmp/error-test-$$"
mkdir -p "$TEST_DIR" && cd "$TEST_DIR"

# Setup
wf-init
cp ../test-configs/testing-config.yml .markdown-workflow/config.yml
wf-create job "Test Co" "Developer"

# Try invalid status transition (should fail but not corrupt)
set +e  # Allow failure
wf-status job test_co_developer_20250121 invalid_status 2>/dev/null
RESULT=$?
set -e

# Verify state is unchanged
if [ $RESULT -ne 0 ]; then
    pnpm snapshot compare "unchanged-after-error" "$TEST_DIR" --content
fi
```

## 🎯 **Pattern 5: Multi-Stage Testing**

Test workflows that go through multiple stages.

```bash
#!/bin/bash
# Test: Job application through all stages

TEST_DIR="/tmp/stages-test-$$"
mkdir -p "$TEST_DIR" && cd "$TEST_DIR"

# Setup
wf-init
cp ../test-configs/testing-config.yml .markdown-workflow/config.yml

# Create application
wf-create job "Tech Startup" "Full Stack Dev"
pnpm snapshot create "stage-1-created" "$TEST_DIR" --content

# Move to submitted
wf-status job tech_startup_full_stack_dev_20250121 submitted
pnpm snapshot create "stage-2-submitted" "$TEST_DIR" --content

# Move to interview
wf-status job tech_startup_full_stack_dev_20250121 interview
wf-notes job tech_startup_full_stack_dev_20250121 technical
pnpm snapshot create "stage-3-interview" "$TEST_DIR" --content

# Final validation
pnpm snapshot compare "stage-3-interview" "$TEST_DIR" --content
```

## 🎯 **Pattern 6: Regression Testing**

Test that new changes don't break existing functionality.

```bash
#!/bin/bash
# Test: Regression test for existing features

BASELINE_SNAPSHOTS=(
    "fresh-init"
    "basic-job-creation"
    "status-transitions"
    "template-processing"
)

for snapshot in "${BASELINE_SNAPSHOTS[@]}"; do
    echo "Testing regression for: $snapshot"

    TEST_DIR="/tmp/regression-$snapshot-$$"
    mkdir -p "$TEST_DIR" && cd "$TEST_DIR"

    # Recreate the scenario (commands depend on snapshot)
    case $snapshot in
        "fresh-init")
            wf-init
            ;;
        "basic-job-creation")
            wf-init
            cp ../test-configs/testing-config.yml .markdown-workflow/config.yml
            wf-create job "Example Co" "Engineer"
            ;;
        # ... more cases
    esac

    # Validate against baseline
    if ! pnpm snapshot compare "$snapshot" "$TEST_DIR" --content; then
        echo "❌ Regression detected in $snapshot"
        exit 1
    fi

    rm -rf "$TEST_DIR"
done

echo "✅ All regression tests passed"
```

## 🔧 **Best Practices**

### **1. Use Descriptive Snapshot Names**

```bash
# Good
pnpm snapshot create "job-with-interview-notes" "$TEST_DIR"
pnpm snapshot create "blog-post-draft-to-published" "$TEST_DIR"

# Bad
pnpm snapshot create "test1" "$TEST_DIR"
pnpm snapshot create "snapshot" "$TEST_DIR"
```

### **2. Always Use Testing Config for Predictable Results**

```bash
# Always copy testing config for deterministic dates
cp ../test-configs/testing-config.yml .markdown-workflow/config.yml
```

### **3. Test Both Success and Failure Cases**

```bash
# Test successful operations
wf-create job "Valid Co" "Valid Role"
pnpm snapshot compare "success-case" "$TEST_DIR"

# Test error handling
set +e
wf-create invalid-workflow "Company" "Role" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Error: Should have failed"
    exit 1
fi
set -e
```

### **4. Use Content Snapshots for Template Testing**

```bash
# When testing template output, include --content
pnpm snapshot create "template-output" "$TEST_DIR" --content
pnpm snapshot compare "template-output" "$TEST_DIR" --content
```

### **5. Organize Snapshots by Feature**

```text
__fs_snapshots__/
├── init-basic.json
├── init-with-workflows.json
├── job-creation-simple.json
├── job-creation-with-notes.json
├── blog-workflow-complete.json
└── error-recovery-test.json
```

## 🚀 **Getting Started Checklist**

1. ✅ **Run the existing test suite**: `pnpm test:e2e:snapshots`
2. ✅ **Create your first custom test**: Copy and modify `examples/my-workflow-test.sh`
3. ✅ **Establish baseline snapshots**: Create snapshots for your key workflows
4. ✅ **Write reproduction tests**: Verify you can recreate the same structures
5. ✅ **Add to CI/CD**: Include snapshot tests in your automation pipeline

## 📝 **Example CI/CD Integration**

```yaml
# .github/workflows/test.yml
name: Test Workflows

on: [push, pull_request]

jobs:
  snapshot-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: pnpm install

      - name: Build project
        run: pnpm build

      - name: Run snapshot tests
        run: pnpm test:e2e:snapshots

      - name: Check for snapshot changes
        run: |
          if git diff --exit-code __fs_snapshots__/; then
            echo "✅ No snapshot changes"
          else
            echo "⚠️ Snapshots changed - review carefully"
            git diff __fs_snapshots__/
            exit 1
          fi
```

This gives you a complete framework for creating robust, maintainable snapshot tests! 🎯
