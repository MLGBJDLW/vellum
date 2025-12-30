/**
 * Command Parser Module Index
 *
 * Exports chain and pipe parsing utilities.
 *
 * @module cli/commands/parser
 */

export {
  type ChainExecutionResult,
  ChainedCommandExecutor,
  type ChainOperator,
  type ChainParseResult,
  ChainParser,
  type ChainSegment,
  type CommandExecutorFn,
} from "./chain-parser.js";

export {
  type FileWriterFn,
  type PipeCommandExecutorFn,
  PipedCommandExecutor,
  type PipeExecutionResult,
  type PipeOperator,
  type PipeParseResult,
  PipeParser,
  type PipeSegment,
  type PipeSegmentType,
} from "./pipe-parser.js";
