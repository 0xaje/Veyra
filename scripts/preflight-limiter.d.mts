export interface LimiterOptions {
  perClient?: number;
  windowMs?: number;
  maxConcurrent?: number;
  maxClients?: number;
  now?: () => number;
}

export type LimiterResult = {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  release: () => void;
};

export interface PreflightLimiter {
  acquire: (peer: string | undefined | null) => LimiterResult;
  snapshot: () => { active: number; trackedClients: number };
}

export function createPreflightLimiter(options?: LimiterOptions): PreflightLimiter;
