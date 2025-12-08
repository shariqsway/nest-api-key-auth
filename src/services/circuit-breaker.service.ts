import { Injectable } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening
  resetTimeoutMs?: number; // Time before attempting to close
  halfOpenMaxAttempts?: number; // Max attempts in half-open state
}

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker pattern implementation for resilience.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly circuits = new Map<
    string,
    {
      state: CircuitState;
      failureCount: number;
      lastFailureTime: number;
      halfOpenAttempts: number;
    }
  >();

  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options?: CircuitBreakerOptions) {
    this.options = {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      halfOpenMaxAttempts: 3,
      ...options,
    };
  }

  /**
   * Executes a function with circuit breaker protection.
   *
   * @param circuitName - Name of the circuit
   * @param fn - Function to execute
   * @returns Result of the function
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(circuitName: string, fn: () => Promise<T>): Promise<T> {
    const circuit = this.getOrCreateCircuit(circuitName);

    // Check circuit state
    if (circuit.state === 'open') {
      const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
      if (timeSinceLastFailure >= this.options.resetTimeoutMs) {
        // Transition to half-open
        circuit.state = 'half-open';
        circuit.halfOpenAttempts = 0;
        ApiKeyLogger.log(
          `Circuit ${circuitName} transitioned to half-open`,
          'CircuitBreakerService',
        );
      } else {
        throw new Error(`Circuit ${circuitName} is open`);
      }
    }

    try {
      const result = await fn();

      // Success - reset circuit if it was half-open
      if (circuit.state === 'half-open') {
        circuit.state = 'closed';
        circuit.failureCount = 0;
        circuit.halfOpenAttempts = 0;
        ApiKeyLogger.log(
          `Circuit ${circuitName} closed after successful half-open attempt`,
          'CircuitBreakerService',
        );
      } else if (circuit.state === 'closed') {
        // Reset failure count on success
        circuit.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.recordFailure(circuitName, circuit);
      throw error;
    }
  }

  /**
   * Records a failure for a circuit.
   *
   * @param circuitName - Name of the circuit
   * @param circuit - Circuit state object
   */
  private recordFailure(
    circuitName: string,
    circuit: ReturnType<typeof this.getOrCreateCircuit>,
  ): void {
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === 'half-open') {
      circuit.halfOpenAttempts++;
      if (circuit.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
        circuit.state = 'open';
        ApiKeyLogger.warn(
          `Circuit ${circuitName} opened after ${circuit.halfOpenAttempts} failed half-open attempts`,
          'CircuitBreakerService',
        );
      }
    } else if (circuit.failureCount >= this.options.failureThreshold) {
      circuit.state = 'open';
      ApiKeyLogger.warn(
        `Circuit ${circuitName} opened after ${circuit.failureCount} failures`,
        'CircuitBreakerService',
      );
    }
  }

  /**
   * Gets or creates a circuit.
   *
   * @param circuitName - Name of the circuit
   * @returns Circuit state object
   */
  private getOrCreateCircuit(circuitName: string) {
    if (!this.circuits.has(circuitName)) {
      this.circuits.set(circuitName, {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        halfOpenAttempts: 0,
      });
    }

    return this.circuits.get(circuitName)!;
  }

  /**
   * Gets the state of a circuit.
   *
   * @param circuitName - Name of the circuit
   * @returns Circuit state
   */
  getCircuitState(circuitName: string): CircuitState {
    const circuit = this.getOrCreateCircuit(circuitName);
    return circuit.state;
  }

  /**
   * Manually resets a circuit.
   *
   * @param circuitName - Name of the circuit
   */
  resetCircuit(circuitName: string): void {
    const circuit = this.getOrCreateCircuit(circuitName);
    circuit.state = 'closed';
    circuit.failureCount = 0;
    circuit.halfOpenAttempts = 0;
    circuit.lastFailureTime = 0;
    ApiKeyLogger.log(`Circuit ${circuitName} manually reset`, 'CircuitBreakerService');
  }

  /**
   * Gets statistics for a circuit.
   *
   * @param circuitName - Name of the circuit
   * @returns Circuit statistics
   */
  getCircuitStats(circuitName: string): {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: Date | null;
    halfOpenAttempts: number;
  } {
    const circuit = this.getOrCreateCircuit(circuitName);
    return {
      state: circuit.state,
      failureCount: circuit.failureCount,
      lastFailureTime: circuit.lastFailureTime > 0 ? new Date(circuit.lastFailureTime) : null,
      halfOpenAttempts: circuit.halfOpenAttempts,
    };
  }
}
