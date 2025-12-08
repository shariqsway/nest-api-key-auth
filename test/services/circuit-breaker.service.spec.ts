import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from '../../src/services/circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CircuitBreakerService,
          useFactory: () => {
            return new CircuitBreakerService({
              failureThreshold: 5,
              resetTimeoutMs: 60000,
              halfOpenMaxAttempts: 3,
            });
          },
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should execute function when circuit is closed', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await service.execute('test-circuit', fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should open circuit after failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute('test-circuit-fail', fn);
        } catch {
          // Expected to fail
        }
      }
      const state = service.getCircuitState('test-circuit-fail');
      expect(state).toBe('open');
    });

    it('should track circuit state correctly', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failure'));
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute('test-circuit-timeout', fn);
        } catch {
          // Expected to fail
        }
      }
      // Verify circuit is open
      const state = service.getCircuitState('test-circuit-timeout');
      expect(state).toBe('open');
      // Note: Testing timeout transition requires time manipulation
      // In production, after resetTimeoutMs (60s), circuit transitions to half-open
    });
  });

  describe('resetCircuit', () => {
    it('should reset a circuit', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failure'));
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute('test-circuit-reset', fn);
        } catch {
          // Expected to fail
        }
      }
      service.resetCircuit('test-circuit-reset');
      const state = service.getCircuitState('test-circuit-reset');
      expect(state).toBe('closed');
    });
  });
});
