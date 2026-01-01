// ============================================
// Approval Routing Between Sessions
// ============================================
// REQ-026: Create approval routing between sessions
// Routes approval requests from child sessions to parent
// session chain via ApprovalForwarder.

import type {
  ApprovalDecision,
  ApprovalForwarder,
  ApprovalRequest,
} from "../orchestrator/approval-forwarder.js";

// ============================================
// Types
// ============================================

/**
 * Represents a routed approval request between sessions.
 */
export interface ApprovalRoute {
  /** Source session requesting approval */
  fromSessionId: string;
  /** Target parent session to handle approval */
  toSessionId: string;
  /** The approval request being routed */
  request: ApprovalRequest;
  /** Timestamp when the route was created */
  routedAt: Date;
}

/**
 * Routes approval requests between sessions in a hierarchy.
 *
 * The router maintains a session hierarchy and forwards approval
 * requests from child sessions to their parent session chain
 * via the ApprovalForwarder.
 *
 * @example
 * ```typescript
 * const router = createApprovalRouter(forwarder);
 *
 * // Register session hierarchy
 * router.registerSession('root-session');
 * router.registerSession('child-session', 'root-session');
 * router.registerSession('grandchild-session', 'child-session');
 *
 * // Route approval from grandchild to root
 * const decision = await router.route('grandchild-session', request);
 *
 * // Get parent session
 * const parent = router.getParentSession('child-session');
 * // => 'root-session'
 * ```
 */
export interface ApprovalRouter {
  /**
   * Routes an approval request to the parent session chain.
   *
   * Traverses up the session hierarchy and forwards the request
   * via the ApprovalForwarder. Returns the decision from the
   * first session that can handle the approval.
   *
   * @param sessionId - Session requesting approval
   * @param request - The approval request to route
   * @returns Promise resolving to the approval decision
   * @throws Error if session is not registered
   */
  route(sessionId: string, request: ApprovalRequest): Promise<ApprovalDecision>;

  /**
   * Gets the parent session ID for a given session.
   *
   * @param sessionId - Session ID to get parent for
   * @returns Parent session ID or undefined if root/not found
   */
  getParentSession(sessionId: string): string | undefined;

  /**
   * Registers a session in the hierarchy.
   *
   * @param sessionId - Session ID to register
   * @param parentId - Optional parent session ID
   */
  registerSession(sessionId: string, parentId?: string): void;

  /**
   * Unregisters a session from the hierarchy.
   *
   * Also unregisters all child sessions recursively.
   *
   * @param sessionId - Session ID to unregister
   */
  unregisterSession(sessionId: string): void;
}

// ============================================
// Implementation
// ============================================

/**
 * Internal implementation of ApprovalRouter.
 */
class ApprovalRouterImpl implements ApprovalRouter {
  /** Map of session ID to parent session ID */
  private readonly sessionHierarchy: Map<string, string | undefined> = new Map();

  /** History of routed approvals for debugging/auditing */
  private readonly routeHistory: ApprovalRoute[] = [];

  constructor(private readonly forwarder: ApprovalForwarder) {}

  route(sessionId: string, request: ApprovalRequest): Promise<ApprovalDecision> {
    // Validate session is registered
    if (!this.sessionHierarchy.has(sessionId)) {
      throw new Error(`Session not registered: ${sessionId}`);
    }

    // Find parent to route to
    const parentId = this.sessionHierarchy.get(sessionId);

    if (parentId === undefined) {
      // This is a root session, forward directly to forwarder
      // which will handle it (e.g., prompt user)
      return this.forwardToParent(sessionId, sessionId, request);
    }

    // Route to parent session
    return this.forwardToParent(sessionId, parentId, request);
  }

  getParentSession(sessionId: string): string | undefined {
    return this.sessionHierarchy.get(sessionId);
  }

  registerSession(sessionId: string, parentId?: string): void {
    // Validate parent exists if specified
    if (parentId !== undefined && !this.sessionHierarchy.has(parentId)) {
      throw new Error(`Parent session not registered: ${parentId}`);
    }

    this.sessionHierarchy.set(sessionId, parentId);
  }

  unregisterSession(sessionId: string): void {
    // Find and unregister all children first
    const children = this.getChildSessions(sessionId);
    for (const childId of children) {
      this.unregisterSession(childId);
    }

    // Remove this session
    this.sessionHierarchy.delete(sessionId);
  }

  /**
   * Gets all direct child sessions of a given session.
   */
  private getChildSessions(sessionId: string): string[] {
    const children: string[] = [];
    for (const [childId, parentId] of Array.from(this.sessionHierarchy.entries())) {
      if (parentId === sessionId) {
        children.push(childId);
      }
    }
    return children;
  }

  /**
   * Forwards approval request to parent via ApprovalForwarder.
   */
  private async forwardToParent(
    fromSessionId: string,
    toSessionId: string,
    request: ApprovalRequest
  ): Promise<ApprovalDecision> {
    // Record the route for history/auditing
    const route: ApprovalRoute = {
      fromSessionId,
      toSessionId,
      request,
      routedAt: new Date(),
    };
    this.routeHistory.push(route);

    // Update request with routing context if needed
    const routedRequest: ApprovalRequest = {
      ...request,
      parentSessionId: toSessionId,
    };

    // Forward to the ApprovalForwarder
    return this.forwarder.forwardApproval(routedRequest);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates an ApprovalRouter instance with the given ApprovalForwarder.
 *
 * The router maintains a session hierarchy and routes approval
 * requests from child sessions to their parent session chain.
 *
 * @param forwarder - The ApprovalForwarder to use for forwarding requests
 * @returns An ApprovalRouter instance
 *
 * @example
 * ```typescript
 * const forwarder = createApprovalForwarder(async (req) => {
 *   return await askUser(`Allow ${req.tool}?`);
 * });
 *
 * const router = createApprovalRouter(forwarder);
 *
 * // Set up session hierarchy
 * router.registerSession('root');
 * router.registerSession('child-1', 'root');
 * router.registerSession('grandchild-1', 'child-1');
 *
 * // Route approval from child session
 * const decision = await router.route('grandchild-1', {
 *   requestId: 'req-123',
 *   subagentId: 'coder',
 *   parentSessionId: 'child-1',
 *   tool: 'writeFile',
 *   params: { path: '/src/app.ts' },
 *   createdAt: new Date(),
 * });
 * ```
 */
export function createApprovalRouter(forwarder: ApprovalForwarder): ApprovalRouter {
  return new ApprovalRouterImpl(forwarder);
}
