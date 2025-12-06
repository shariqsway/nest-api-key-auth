/**
 * Type definition for Redis client.
 * Compatible with ioredis and other Redis clients.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  mget(keys: string[]): Promise<(string | null)[]>;
  pipeline(): RedisPipeline;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  zcard(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface RedisPipeline {
  zremrangebyscore(key: string, min: number, max: number): RedisPipeline;
  zcard(key: string): RedisPipeline;
  zadd(key: string, score: number, member: string): RedisPipeline;
  expire(key: string, seconds: number): RedisPipeline;
  setex(key: string, seconds: number, value: string): RedisPipeline;
  del(...keys: string[]): RedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]>>;
}
