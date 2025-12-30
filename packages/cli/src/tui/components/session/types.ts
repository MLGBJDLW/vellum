/**
 * Session Management Types (T056)
 *
 * Type definitions for session management components.
 *
 * @module tui/components/session/types
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Metadata for a session stored in the session list.
 */
export interface SessionMetadata {
  /** Unique session identifier */
  readonly id: string;
  /** Display title for the session */
  readonly title: string;
  /** Preview of the last message in the session */
  readonly lastMessage?: string;
  /** Timestamp when the session was last active */
  readonly timestamp: Date;
  /** Total number of messages in the session */
  readonly messageCount: number;
}

/**
 * A message within a session for preview display.
 */
export interface SessionPreviewMessage {
  /** Unique message identifier */
  readonly id: string;
  /** Role of the message sender */
  readonly role: "user" | "assistant" | "system" | "tool";
  /** Content of the message */
  readonly content: string;
  /** Timestamp when the message was created */
  readonly timestamp: Date;
}

// =============================================================================
// Component Props
// =============================================================================

/**
 * Props for SessionItem component.
 */
export interface SessionItemProps {
  /** Session metadata to display */
  readonly session: SessionMetadata;
  /** Whether this session is currently selected */
  readonly isSelected?: boolean;
  /** Whether this session is the active session */
  readonly isActive?: boolean;
  /** Callback when the session is clicked/selected */
  readonly onSelect?: (sessionId: string) => void;
}

/**
 * Props for SessionListPanel component.
 */
export interface SessionListPanelProps {
  /** List of sessions to display */
  readonly sessions: readonly SessionMetadata[];
  /** ID of the currently selected session */
  readonly selectedSessionId?: string;
  /** ID of the currently active session */
  readonly activeSessionId?: string;
  /** Callback when a session is selected */
  readonly onSelectSession?: (sessionId: string) => void;
  /** Maximum height in lines (optional) */
  readonly maxHeight?: number;
  /** Whether the panel is focused for keyboard input */
  readonly isFocused?: boolean;
}

/**
 * Props for SessionPicker modal component.
 */
export interface SessionPickerProps {
  /** List of sessions to display */
  readonly sessions: readonly SessionMetadata[];
  /** ID of the currently active session */
  readonly activeSessionId?: string;
  /** Callback when a session is selected */
  readonly onSelect: (sessionId: string) => void;
  /** Callback to close the picker */
  readonly onClose: () => void;
  /** Whether the picker is visible */
  readonly isOpen: boolean;
}

/**
 * Props for SessionPreview component.
 */
export interface SessionPreviewProps {
  /** Messages to preview */
  readonly messages: readonly SessionPreviewMessage[];
  /** Maximum height in lines */
  readonly maxHeight?: number;
  /** Title of the session being previewed */
  readonly title?: string;
}
