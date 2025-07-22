# Filesystem Snapshot Testing

This project includes a Jest-like filesystem snapshot testing tool that allows you to capture directory structures and compare them over time. This is perfect for testing CLI commands that create, modify, or organize files and directories.

## 🎯 **Use Cases**

- **CLI Testing**: Verify that commands create the expected file structure
- **Regression Testing**: Ensure new changes don't break existing functionality  
- **Template Validation**: Confirm that templates generate the correct output
- **Migration Testing**: Validate file structure changes during upgrades

## 🚀 **Quick Start**

### Basic Commands

```bash
# Create a snapshot of a directory
pnpm snapshot create my-snapshot /path/to/directory

# Compare current directory state with snapshot
pnpm snapshot compare my-snapshot /path/to/directory

# List all snapshots
pnpm snapshot list

# Update an existing snapshot
pnpm snapshot update my-snapshot /path/to/directory

# Delete a snapshot
pnpm snapshot delete my-snapshot
```

### With Content Hashing

```bash
# Include file content in snapshots (for small text files)
pnpm snapshot create my-snapshot /path/to/directory --content

# Compare including content changes
pnpm snapshot compare my-snapshot /path/to/directory --content
```

## 📁 **How It Works**

### Snapshot Structure

Snapshots are stored in `__fs_snapshots__/` as JSON files containing:

```json
{
  "options": { "includeContent": true },
  "tree": [
    {
      "name": "file.txt",
      "path": "file.txt", 
      "type": "file",
      "size": 1234,
      "modified": "2025-01-21T08:00:00.000Z",
      "contentHash": "abc123..."
    },
    {
      "name": "subfolder",
      "path": "subfolder",
      "type": "directory", 
      "children": [...]
    }
  ]
}
```

### Comparison Output

When differences are found:

```
❌ Found 3 difference(s):

+ Added files:
  + new-file.txt (file)
  + new-folder/ (directory)

- Removed files:
  - old-file.txt (file)

~ Modified files:
  ~ existing-file.txt
    size: 100 → 150
    content: abc123 → def456
```

## 🧪 **Testing Integration**

### End-to-End Test Scripts

We provide two test scripts:

#### Basic E2E Tests
```bash
# Run basic CLI functionality tests
pnpm test:e2e
```

#### Snapshot-Enhanced E2E Tests  
```bash
# Run tests with filesystem validation
pnpm test:e2e:snapshots
```

### Example Test Workflow

```bash
# 1. Create baseline snapshot of clean directory
pnpm snapshot create clean-project ./test-project

# 2. Run your CLI command
node dist/cli/index.js init

# 3. Verify the result matches expected structure
pnpm snapshot compare initialized-project ./test-project
```

## ⚙️ **Configuration Options**

### Exclusion Patterns

By default, these patterns are excluded:
- `node_modules`
- `.git`
- `__fs_snapshots__`
- `.DS_Store`
- `*.log`
- `dist`
- `build`
- `coverage`

#### Custom Exclusions
```bash
pnpm snapshot create my-snapshot ./dir --exclude node_modules .env "*.tmp"
```

### Content Inclusion

- **Without `--content`**: Only tracks file size, modification time, and structure
- **With `--content`**: Also includes MD5 hashes for content comparison
- **Smart Content**: Only includes actual content for small text files (< 10KB)

## 📋 **Best Practices**

### 1. **Descriptive Snapshot Names**
```bash
# Good
pnpm snapshot create fresh-init-project ./project
pnpm snapshot create project-with-job-collection ./project

# Bad  
pnpm snapshot create test1 ./project
pnpm snapshot create temp ./project
```

### 2. **Test Isolation**
```bash
# Always test in temporary directories
TEST_DIR="/tmp/my-test-$$"
mkdir -p "$TEST_DIR"
# ... run tests in $TEST_DIR
rm -rf "$TEST_DIR"
```

### 3. **Baseline Snapshots**
Create snapshots for common states:
- Empty directory
- Fresh project initialization
- Project with sample data
- Project after typical operations

### 4. **Version Control**
```bash
# Include snapshots in git for team collaboration
git add __fs_snapshots__/
git commit -m "Add baseline snapshots for CLI testing"
```

## 🕐 **Testing with Predictable Dates**

One of the biggest challenges with filesystem snapshots is that CLI commands often include dates in their output, causing tests to fail when run on different days. We solve this with testing overrides in `config.yml`:

### **Configuration for Predictable Testing**

```yaml
# config.yml
system:
  testing:
    # Fixed date for predictable testing
    override_current_date: "2025-01-21T10:00:00.000Z"
    # Fixed timezone for consistent formatting
    override_timezone: "UTC"  
    # Use deterministic IDs instead of date-based ones
    deterministic_ids: true
```

### **How Date Overrides Work**

When `override_current_date` is set, all date functions in the system use this fixed date instead of the current system date:

- Collection IDs: `company_role_20250121` (always the same)
- Template dates: `{{date}}` resolves to `2025-01-21` 
- Metadata timestamps: Always use the override date
- Status history: Predictable timestamps

### **Example: Creating Deterministic Snapshots**

```bash
# 1. Create project with testing config
mkdir test-project && cd test-project
wf-init
cp ../test-configs/testing-config.yml .markdown-workflow/config.yml

# 2. Create collections - they'll have predictable dates
wf-create job "Example Corp" "Software Engineer"
# Creates: example_corp_software_engineer_20250121

# 3. Take snapshot - will always match in future runs
pnpm snapshot create predictable-project ./test-project --content
```

### **Benefits**

- ✅ **Deterministic snapshots**: Same input always produces same output
- ✅ **Team collaboration**: Snapshots work across different machines/timezones  
- ✅ **CI/CD friendly**: Tests don't break when run on different days
- ✅ **Debugging**: Easy to trace issues when dates are predictable

## 🔧 **Advanced Usage**

### Automated Regression Testing

```bash
#!/bin/bash
# regression-test.sh

# Create fresh environment
TEST_DIR="/tmp/regression-test-$$"
mkdir -p "$TEST_DIR"

# Run your operations
cd "$TEST_DIR"
your-cli-command init
your-cli-command create-something

# Validate result
if pnpm snapshot compare expected-state "$TEST_DIR"; then
    echo "✅ Regression test passed"
else
    echo "❌ Regression test failed"
    exit 1
fi
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Run E2E Tests with Snapshots
  run: |
    pnpm build
    pnpm test:e2e:snapshots
    
- name: Check for snapshot changes
  run: |
    if git diff --exit-code __fs_snapshots__/; then
      echo "No snapshot changes"
    else
      echo "Snapshots changed - review carefully"
      git diff __fs_snapshots__/
    fi
```

### Snapshot Management

```bash
# Update all outdated snapshots
find __fs_snapshots__ -name "*.json" -exec basename {} .json \; | \
while read snapshot; do
    pnpm snapshot compare "$snapshot" ./test-dir --update || true
done

# Clean up old snapshots
pnpm snapshot list
pnpm snapshot delete old-snapshot-name
```

## 📊 **Snapshot Formats**

### Directory Structure Snapshot
Captures the hierarchical organization of files and folders.

### File Metadata Snapshot  
Includes size, modification time, permissions for each file.

### Content Hash Snapshot
MD5 hashes for detecting content changes in text files.

### Mixed Snapshot
Combines structure, metadata, and selective content hashing.

## 🐛 **Troubleshooting**

### Common Issues

**Snapshot not found**
```bash
❌ Snapshot 'my-snapshot' not found
```
- Check snapshot name spelling
- Run `pnpm snapshot list` to see available snapshots

**Permission errors**
```bash
❌ Error scanning directory: Permission denied
```
- Ensure read permissions on target directory
- Run with appropriate user permissions

**Large content files**
```bash
# Content snapshots work best with text files < 10KB
# For larger files, rely on size and modification time
pnpm snapshot create my-snapshot ./dir  # without --content
```

### Performance Notes

- **Structure-only snapshots**: Very fast, suitable for large directories
- **Content snapshots**: Slower but more thorough, best for smaller projects
- **Exclusion patterns**: Use to skip large folders like `node_modules`

## 🔗 **Integration with Jest**

If you want to use snapshots in your Jest tests:

```javascript
// test.js
import { execSync } from 'child_process';

test('CLI creates expected structure', () => {
  const testDir = '/tmp/cli-test';
  
  // Run CLI command
  execSync(`node dist/cli/index.js init`, { cwd: testDir });
  
  // Compare with snapshot
  const result = execSync(`node scripts/snapshot.js compare expected-init ${testDir}`, 
    { cwd: process.cwd(), encoding: 'utf8' });
  
  expect(result).toContain('No differences found');
});
```

This snapshot testing system gives you powerful tools for validating filesystem changes in your CLI applications! 🎉