/**
 * Result Type Module
 *
 * Re-exports Result types from @vellum/shared for backward compatibility.
 * The canonical implementation lives in @vellum/shared to avoid circular
 * dependencies between @vellum/core and @vellum/provider.
 *
 * @module result
 */

export type { Result } from "@vellum/shared";
// Re-export everything from shared
// Note: Ok and Err are functions that create Result types.
// The Ok<T> and Err<E> interfaces are accessible via typeof inference.
export {
  all,
  Err,
  flatMap,
  isErr,
  isOk,
  map,
  mapErr,
  match,
  Ok,
  tryCatch,
  tryCatchAsync,
  unwrap,
  unwrapOr,
} from "@vellum/shared";
