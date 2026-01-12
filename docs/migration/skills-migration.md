# Migration Guide: Skills to .vellum/

This guide helps you migrate skills from `.github/skills/` to the new `.vellum/skills/` directory.

## Why Migrate?

The new `.vellum/` directory structure provides:

| Feature | Old (`.github/skills/`) | New (`.vellum/skills/`) |
|---------|------------------------|------------------------|
| Priority | 90 | 100 (highest) |
| Scope | Project only | Project + Global (`~/.vellum/`) |
| Organization | Skills only | Prompts, rules, commands, workflows |
| Discovery | GitHub-specific | Multi-source with fallback |
| Hot Reload | Limited | Full support |
| Mode Rules | Not supported | Mode-specific rules directories |
| Validation | Manual | `vellum prompt validate` |

### Key Benefits

1. **Higher Priority**: `.vellum/` has priority 100 vs `.github/` at 90
2. **Unified Structure**: All customizations in one place
3. **Better Organization**: Separate directories for different content types
4. **Global Skills**: Share skills across all projects via `~/.vellum/skills/`
5. **Hot Reload**: Changes apply immediately without restart
6. **Built-in Validation**: CLI command validates syntax and structure

---

## Migration Options

### Option 1: Automatic Migration (Recommended)

Use the `vellum migrate prompts` command:

```bash
# Preview migration (no changes made)
vellum migrate prompts --dry-run

# Run migration with backup
vellum migrate prompts --backup

# Run migration (overwrites if exists)
vellum migrate prompts
```

### Option 2: Manual Migration

If you prefer manual control, follow these steps.

---

## Step-by-Step Manual Migration

### Step 1: Create Directory Structure

```bash
# Create the .vellum/skills/ directory
mkdir -p .vellum/skills
```

### Step 2: Copy Skill Directories

```bash
# Copy all skills
cp -r .github/skills/* .vellum/skills/
```

### Step 3: Verify Structure

Each skill should have this structure:

```
.vellum/skills/
└── my-skill/
    ├── SKILL.md           # Required: manifest file
    ├── scripts/           # Optional: executable scripts
    ├── references/        # Optional: additional docs
    └── assets/            # Optional: templates, data
```

### Step 4: Validate Migration

```bash
# Check all skills are valid
vellum prompt validate
```

### Step 5: Remove Old Directory (Optional)

Once verified, you can remove the old directory:

```bash
# Backup first
mv .github/skills .github/skills.backup

# Or delete if confident
rm -rf .github/skills
```

---

## File Format Changes

The skill file format is compatible between both locations. No changes to `SKILL.md` content are required.

### Compatible Frontmatter

```yaml
---
name: python-testing
description: Python testing best practices with pytest
version: "1.0.0"
priority: 50

triggers:
  - type: keyword
    pattern: "pytest|test|unittest"
  - type: file_pattern
    pattern: "**/*_test.py"

tags:
  - testing
  - python
---
```

### No Changes Required

- ✅ Frontmatter format is identical
- ✅ Markdown body sections are identical
- ✅ Triggers work the same way
- ✅ Scripts and references work the same way

---

## Using `vellum migrate prompts`

### Command Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview changes without applying them |
| `--backup` | Create `.github/skills.backup/` before migrating |
| `--force` | Overwrite existing files in `.vellum/skills/` |

### Example Output

```bash
$ vellum migrate prompts --dry-run

Vellum Prompt Migration
=======================

Sources found:
  ✓ .github/skills/ (3 skills)

Migration plan:
  → python-testing/.github/skills/python-testing/SKILL.md
    └─ .vellum/skills/python-testing/SKILL.md

  → typescript-strict/.github/skills/typescript-strict/SKILL.md
    └─ .vellum/skills/typescript-strict/SKILL.md

  → react-hooks/.github/skills/react-hooks/SKILL.md
    └─ .vellum/skills/react-hooks/SKILL.md

Summary:
  3 skills to migrate
  0 conflicts detected

Run without --dry-run to apply changes.
```

### Running the Migration

```bash
$ vellum migrate prompts --backup

Vellum Prompt Migration
=======================

✓ Backup created: .github/skills.backup/
✓ Migrated: python-testing
✓ Migrated: typescript-strict
✓ Migrated: react-hooks

Migration complete: 3 skills migrated
```

---

## Handling Conflicts

If `.vellum/skills/` already contains skills with the same name:

### Conflict Detection

```bash
$ vellum migrate prompts --dry-run

⚠️  Conflicts detected:
  - python-testing: exists in both .github/skills/ and .vellum/skills/

Options:
  1. Use --force to overwrite .vellum/ versions
  2. Manually merge the skills
  3. Rename one of the conflicting skills
```

### Resolution Options

**Option 1: Overwrite with `--force`**

```bash
vellum migrate prompts --force
```

**Option 2: Manual Merge**

Compare both versions and merge manually:

```bash
# View differences
diff .github/skills/python-testing/SKILL.md .vellum/skills/python-testing/SKILL.md

# Edit .vellum version to include desired content
```

**Option 3: Rename**

Rename one skill to avoid conflict:

```bash
mv .vellum/skills/python-testing .vellum/skills/python-testing-project
```

---

## Post-Migration Checklist

After migration, verify everything works:

- [ ] Run `vellum prompt validate` - all skills should pass
- [ ] Start Vellum and trigger a skill - verify it activates
- [ ] Check logs for any skill loading errors
- [ ] Remove or archive `.github/skills/` backup

---

## Troubleshooting

### Skill Not Found After Migration

**Symptom**: Skill doesn't activate after migration

**Solutions**:
1. Verify directory structure is correct
2. Check `name` field in frontmatter matches directory name
3. Run `vellum prompt validate` to check for errors
4. Ensure triggers are correctly defined

### Invalid YAML Error

**Symptom**: `vellum prompt validate` reports YAML errors

**Solutions**:
1. Check for tab characters (use spaces instead)
2. Verify all strings with special characters are quoted
3. Check for proper indentation (2 spaces)
4. Validate YAML at https://yamlchecker.com/

### Missing Dependencies

**Symptom**: Skill references dependencies that don't exist

**Solutions**:
1. Migrate dependent skills first
2. Check `dependencies` field references valid skill names
3. Ensure all referenced skills are in `.vellum/skills/`

### Permission Errors

**Symptom**: Cannot write to `.vellum/` directory

**Solutions**:
1. Check directory permissions
2. Ensure you have write access to project root
3. Run with appropriate permissions

---

## Compatibility Notes

### Backward Compatibility

Vellum continues to scan `.github/skills/` with priority 90. You can:

- Keep skills in `.github/skills/` (they still work)
- Use both locations (`.vellum/` takes precedence)
- Gradually migrate over time

### Multi-Source Loading

After migration, Vellum loads skills from all sources:

```
Priority Order:
100 → .vellum/skills/        ← Migrated location (highest)
 90 → .github/skills/        ← Original location
 80 → .claude/skills/        ← Claude Code compat
 70 → .roo/skills/           ← Roo Code compat
 60 → .kilocode/skills/      ← Kilocode compat
 50 → ~/.vellum/skills/      ← Global user skills
 10 → (built-in)             ← Vellum defaults
```

### Same-Name Resolution

If a skill exists in multiple locations, highest priority wins:

```
.vellum/skills/python-testing/     → Priority 100 ✓ (used)
.github/skills/python-testing/     → Priority 90  ✗ (ignored)
```

---

## Reference

- [Prompt Customization](../customization/prompts.md) - Complete customization guide
- [Skills System](../skills.md) - Detailed skills documentation
- [Configuration](../configuration.md) - Global configuration options
