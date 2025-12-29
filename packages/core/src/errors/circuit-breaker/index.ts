// ============================================
// Circuit Breaker Module - Barrel Export (T015)
// ============================================

export {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitState,
  circuitClose,
  circuitHalfOpen,
  circuitOpen,
} from "./CircuitBreaker.js";
export { CircuitBreakerRegistry } from "./CircuitBreakerRegistry.js";
export { CircuitOpenError } from "./CircuitOpenError.js";
