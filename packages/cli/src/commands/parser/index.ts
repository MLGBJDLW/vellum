/**
 * Command Parser Module Index
 *
 * Exports chain and pipe parsing utilities.
 *
 * @module cli/commands/parser
 */

export {
  ChainParser,
  ChainedCommandExecutor,
  type ChainOperator,
  type ChainSegment,
  type ChainParseResult,
  type ChainExecutionResult,
  type CommandExecutorFn,
} from "./chain-parser.js";

export {
  PipeParser,
  PipedCommandExecutor,
  type PipeOperator,
  type PipeSegment,
  type PipeSegmentType,
  type PipeParseResult,
  type PipeExecutionResult,
  type PipeCommandExecutorFn,
  type FileWriterFn,
} from "./pipe-parser.js";
