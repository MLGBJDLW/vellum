// ============================================
// Spec Session Integration
// ============================================

/**
 * Session lifecycle hooks for spec workflow persistence.
 *
 * Provides integration between the spec workflow system and
 * session management for state persistence across sessions.
 *
 * @module @vellum/core/spec/session-integration
 */

import type { Session } from "../session/types.js";
import type { SpecWorkflowState } from "./types.js";

// =============================================================================
// Session Integration Types
// =============================================================================

/**
 * Metadata key used for storing workflow state in sessions.
 */
export const WORKFLOW_METADATA_KEY = "spec:workflow" as const;

/**
 * Session metadata extension for spec workflow.
 */
export interface SpecSessionMetadata {
  /** ID of the linked workflow */
  workflowId: string;
  /** When the workflow was attached */
  attachedAt: Date;
  /** Last synced workflow state (serialized) */
  workflowState?: SpecWorkflowState;
}

// =============================================================================
// Session Integration Class
// =============================================================================

/**
 * Integrates spec workflows with session lifecycle.
 *
 * Provides hooks for initializing, persisting, and retrieving
 * workflow state from sessions. This is a P2 feature with
 * minimal implementation.
 *
 * @example
 * ```typescript
 * const integration = new SpecSessionIntegration();
 *
 * // On session start
 * const state = integration.onSessionStart(session);
 *
 * // Attach workflow to session
 * integration.attachToSession(session, workflowId);
 *
 * // On session end
 * integration.onSessionEnd(session, currentState);
 * ```
 */
export class SpecSessionIntegration {
  /**
   * Initialize spec state from session on session start.
   *
   * Retrieves any previously persisted workflow state from
   * the session's extended metadata.
   *
   * @param session - The session that is starting
   * @returns The workflow state if found, undefined otherwise
   */
  onSessionStart(session: Session): SpecWorkflowState | undefined {
    return this.getWorkflowFromSession(session);
  }

  /**
   * Persist spec state to session on session end.
   *
   * Stores the current workflow state in the session's
   * extended metadata for later restoration.
   *
   * @param session - The session that is ending
   * @param workflowState - The current workflow state to persist
   */
  onSessionEnd(session: Session, workflowState?: SpecWorkflowState): void {
    if (!workflowState) {
      return;
    }

    // Store workflow state in session metadata extension
    // Note: Actual persistence depends on session storage implementation
    const metadata = this.getOrCreateMetadata(session);
    metadata.workflowState = workflowState;
  }

  /**
   * Link a workflow to a session.
   *
   * Creates the association between a spec workflow and
   * a session for state tracking.
   *
   * @param session - The session to attach to
   * @param workflowId - The workflow ID to link
   * @returns The created metadata
   */
  attachToSession(session: Session, workflowId: string): SpecSessionMetadata {
    const metadata: SpecSessionMetadata = {
      workflowId,
      attachedAt: new Date(),
    };

    // Store in session's extended metadata
    this.setMetadata(session, metadata);

    return metadata;
  }

  /**
   * Retrieve workflow state from a session.
   *
   * Gets the persisted workflow state if the session
   * has an attached workflow.
   *
   * @param session - The session to retrieve from
   * @returns The workflow state if found, undefined otherwise
   */
  getWorkflowFromSession(session: Session): SpecWorkflowState | undefined {
    const metadata = this.getMetadata(session);
    return metadata?.workflowState;
  }

  /**
   * Check if a session has an attached workflow.
   *
   * @param session - The session to check
   * @returns True if a workflow is attached
   */
  hasWorkflow(session: Session): boolean {
    return this.getMetadata(session) !== undefined;
  }

  /**
   * Get the workflow ID attached to a session.
   *
   * @param session - The session to check
   * @returns The workflow ID if attached, undefined otherwise
   */
  getWorkflowId(session: Session): string | undefined {
    return this.getMetadata(session)?.workflowId;
  }

  /**
   * Detach workflow from session.
   *
   * Removes the workflow association from the session.
   *
   * @param session - The session to detach from
   */
  detachFromSession(session: Session): void {
    this.deleteMetadata(session);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Internal metadata storage using WeakMap for memory safety.
   * In a full implementation, this would persist to session storage.
   */
  private readonly metadataStore = new WeakMap<Session, SpecSessionMetadata>();

  private getMetadata(session: Session): SpecSessionMetadata | undefined {
    return this.metadataStore.get(session);
  }

  private setMetadata(session: Session, metadata: SpecSessionMetadata): void {
    this.metadataStore.set(session, metadata);
  }

  private deleteMetadata(session: Session): void {
    this.metadataStore.delete(session);
  }

  private getOrCreateMetadata(session: Session): SpecSessionMetadata {
    let metadata = this.getMetadata(session);
    if (!metadata) {
      metadata = {
        workflowId: "",
        attachedAt: new Date(),
      };
      this.setMetadata(session, metadata);
    }
    return metadata;
  }
}
