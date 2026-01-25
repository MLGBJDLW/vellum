/**
 * Role Manager
 *
 * Manages specialist role state for the agent.
 * Roles define the agent's expertise and behavior.
 *
 * @module core/agent/role-manager
 */

/**
 * Available specialist roles
 */
export type AgentRole =
  | "coder" // Implementation specialist
  | "qa" // Quality assurance, testing
  | "security" // Security review
  | "analyst" // Code analysis (read-only)
  | "architect" // System design
  | "writer" // Documentation
  | "orchestrator"; // Multi-agent coordination

/**
 * Role metadata
 */
export interface RoleInfo {
  readonly name: AgentRole;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly level: number; // 0=orchestrator, 1=manager, 2=worker
}

/**
 * All available roles with metadata
 */
export const AVAILABLE_ROLES: Record<AgentRole, RoleInfo> = {
  coder: {
    name: "coder",
    displayName: "Coder",
    description: "Implementation specialist - writes production code",
    icon: "◆",
    level: 2,
  },
  qa: {
    name: "qa",
    displayName: "QA",
    description: "Quality assurance - testing and debugging",
    icon: "◇",
    level: 2,
  },
  security: {
    name: "security",
    displayName: "Security",
    description: "Security specialist - vulnerability review",
    icon: "◈",
    level: 2,
  },
  analyst: {
    name: "analyst",
    displayName: "Analyst",
    description: "Code analyst - read-only analysis",
    icon: "○",
    level: 2,
  },
  architect: {
    name: "architect",
    displayName: "Architect",
    description: "System architect - design and ADRs",
    icon: "◉",
    level: 1,
  },
  writer: {
    name: "writer",
    displayName: "Writer",
    description: "Technical writer - documentation",
    icon: "◎",
    level: 2,
  },
  orchestrator: {
    name: "orchestrator",
    displayName: "Orchestrator",
    description: "Multi-agent coordinator",
    icon: "●",
    level: 0,
  },
};

/**
 * All available role names as an array
 */
export const AGENT_ROLES = Object.keys(AVAILABLE_ROLES) as AgentRole[];

/**
 * Role manager configuration options
 */
export interface RoleManagerOptions {
  initialRole: AgentRole;
  onRoleChange?: (newRole: AgentRole, oldRole: AgentRole) => void;
}

/**
 * Result of a role switch operation
 */
export interface RoleSwitchResult {
  success: boolean;
  message: string;
  previousRole?: AgentRole;
  currentRole?: AgentRole;
}

/**
 * Role Manager
 *
 * Manages the current specialist role for the agent.
 * Supports runtime role switching with optional change callbacks.
 */
export class RoleManager {
  #currentRole: AgentRole;
  #onRoleChange?: (newRole: AgentRole, oldRole: AgentRole) => void;

  constructor(options: RoleManagerOptions) {
    this.#currentRole = options.initialRole;
    this.#onRoleChange = options.onRoleChange;
  }

  /**
   * Get the current role name
   */
  get currentRole(): AgentRole {
    return this.#currentRole;
  }

  /**
   * Get full metadata for the current role
   */
  get currentRoleInfo(): RoleInfo {
    return AVAILABLE_ROLES[this.#currentRole];
  }

  /**
   * Switch to a new role
   *
   * @param newRole - The role to switch to
   * @returns Result indicating success/failure with message
   */
  switchRole(newRole: AgentRole): RoleSwitchResult {
    if (!AVAILABLE_ROLES[newRole]) {
      return { success: false, message: `Unknown role: ${newRole}` };
    }

    if (newRole === this.#currentRole) {
      return {
        success: true,
        message: `Already in ${newRole} role`,
        currentRole: newRole,
      };
    }

    const oldRole = this.#currentRole;
    this.#currentRole = newRole;
    this.#onRoleChange?.(newRole, oldRole);

    return {
      success: true,
      message: `Switched to ${AVAILABLE_ROLES[newRole].displayName} role`,
      previousRole: oldRole,
      currentRole: newRole,
    };
  }

  /**
   * Check if a string is a valid role name
   */
  static isValidRole(role: string): role is AgentRole {
    return role in AVAILABLE_ROLES;
  }
}

/**
 * Create a new RoleManager instance
 *
 * @param options - Configuration options
 * @returns A new RoleManager instance
 */
export function createRoleManager(options: RoleManagerOptions): RoleManager {
  return new RoleManager(options);
}

// Export Role as alias for backward compatibility
export type { AgentRole as Role };
