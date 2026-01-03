#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage function
usage() {
    echo "Usage: $0 /path/to/plugin"
    echo ""
    echo "Validates plugin structure and format."
    exit 1
}

# Error function
error() {
    echo -e "${RED}✗${NC} $1" >&2
}

# Success function
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Warning function
warning() {
    echo -e "${YELLOW}!${NC} $1"
}

# Check if path argument is provided
if [ $# -eq 0 ]; then
    error "No plugin path provided"
    usage
fi

PLUGIN_PATH="$1"

# Check if path exists
if [ ! -d "$PLUGIN_PATH" ]; then
    error "Plugin path does not exist: $PLUGIN_PATH"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    error "jq is required but not installed. Please install jq."
    exit 1
fi

echo "Validating plugin at: $PLUGIN_PATH"
echo ""

EXIT_CODE=0

# Check if plugin.json exists
PLUGIN_JSON="$PLUGIN_PATH/.vellum-plugin/plugin.json"
if [ ! -f "$PLUGIN_JSON" ]; then
    error "plugin.json not found at .vellum-plugin/plugin.json"
    EXIT_CODE=1
else
    success "plugin.json exists"
    
    # Validate JSON format
    if ! jq empty "$PLUGIN_JSON" 2>/dev/null; then
        error "plugin.json is not valid JSON"
        EXIT_CODE=1
    else
        success "plugin.json is valid JSON"
        
        # Check name field
        NAME=$(jq -r '.name // empty' "$PLUGIN_JSON")
        if [ -z "$NAME" ]; then
            error "name field is missing or empty"
            EXIT_CODE=1
        else
            # Validate kebab-case: lowercase letters, numbers, hyphens, must start with letter
            if [[ ! "$NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
                error "name '$NAME' is not valid kebab-case (must start with letter, contain only lowercase letters, numbers, and hyphens)"
                EXIT_CODE=1
            else
                success "name is valid kebab-case: $NAME"
            fi
        fi
        
        # Check version field
        VERSION=$(jq -r '.version // empty' "$PLUGIN_JSON")
        if [ -z "$VERSION" ]; then
            error "version field is missing or empty"
            EXIT_CODE=1
        else
            # Validate semver: X.Y.Z format (basic validation)
            if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$ ]]; then
                error "version '$VERSION' is not valid semver (expected format: X.Y.Z)"
                EXIT_CODE=1
            else
                success "version is valid semver: $VERSION"
            fi
        fi
        
        # Check skills
        SKILLS=$(jq -r '.skills // [] | .[]' "$PLUGIN_JSON" 2>/dev/null)
        if [ -n "$SKILLS" ]; then
            success "skills declared in plugin.json"
            
            # Check each skill has corresponding SKILL.md
            while IFS= read -r skill; do
                if [ -z "$skill" ]; then
                    continue
                fi
                
                SKILL_FILE="$PLUGIN_PATH/skills/$skill/SKILL.md"
                if [ ! -f "$SKILL_FILE" ]; then
                    error "SKILL.md not found for skill '$skill' at skills/$skill/SKILL.md"
                    EXIT_CODE=1
                else
                    success "SKILL.md exists for skill: $skill"
                fi
            done <<< "$SKILLS"
        else
            warning "No skills declared in plugin.json"
        fi
    fi
fi

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Plugin validation passed!${NC}"
else
    echo -e "${RED}Plugin validation failed!${NC}"
fi

exit $EXIT_CODE
