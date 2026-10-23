export interface LimiterOptions {
  perClient?: number;
  windowMs?: number;
  maxConcurrent?: number;
  maxClients?: number;
  now?: () => number;
}

export type LimiterResult =
  | {
      allowed: true;
      release: () => void;
    }
  | {
      allowed: false;
      reason: "rate_limit" | "busy";
      retryAfter: number;
    };

export interface PreflightLimiter {
  acquire: (peer: string | undefined | null) => LimiterResult;
  snapshot: () => { active: number; trackedClients: number };
}

export function createPreflightLimiter(options?: LimiterOptions): PreflightLimiter;
