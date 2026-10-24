import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeSuiAddress } from "./recipient-check.ts";

export type DurableStorageReceipt = {
  schema: "veyra.storage_receipt.v1";
  receiptId: string;
  jobId: string;
  blobId: string;
  address: string;
  counterpartyId: string;
  recordHash: string;
  storedAt: string;
  status: "completed";
  paymentAuthorized: false;
};

export type PerWalletQuotaState = {
  dailyCount: number;
  lastResetDay: string; // YYYY-MM-DD
  totalCount: number;
};

export type StorageSafeguardsConfig = {
  maxDailyWritesPerWallet: number;
  maxGlobalDailyWrites: number;
  filePath?: string;
};

export type SafeguardLedgerData = {
  schema: "veyra.safeguard_ledger.v1";
  updatedAt: string;
  globalDailyCount: number;
  currentDay: string;
  walletQuotas: Record<string, PerWalletQuotaState>;
  receipts: Record<string, DurableStorageReceipt>; // keyed by idempotencyKey
  idempotencyRecordHashes: Record<string, string>; // recordHash -> receiptId
};

export class StorageSafeguardsLedger {
  private config: StorageSafeguardsConfig;
  private data: SafeguardLedgerData;
  private filePath: string | null;

  constructor(config: StorageSafeguardsConfig, initialData?: SafeguardLedgerData) {
    this.config = config;
    this.filePath = config.filePath || null;
    const today = new Date().toISOString().slice(0, 10);
    this.data = initialData || {
      schema: "veyra.safeguard_ledger.v1",
      updatedAt: new Date().toISOString(),
      globalDailyCount: 0,
      currentDay: today,
      walletQuotas: {},
      receipts: {},
      idempotencyRecordHashes: {},
    };
  }

  private ensureDayRollover(now = Date.now()): void {
    const today = new Date(now).toISOString().slice(0, 10);
    if (this.data.currentDay !== today) {
      this.data.currentDay = today;
      this.data.globalDailyCount = 0;
      for (const wallet of Object.keys(this.data.walletQuotas)) {
        this.data.walletQuotas[wallet].dailyCount = 0;
        this.data.walletQuotas[wallet].lastResetDay = today;
      }
    }
  }

  public checkAdmission(
    walletAddress: string,
    idempotencyKey: string,
    recordHash: string,
    now = Date.now()
  ): { allowed: boolean; existingReceipt?: DurableStorageReceipt; reason?: string } {
    this.ensureDayRollover(now);

    // 1. Idempotency check: if already processed for this idempotencyKey or exact recordHash, return existing receipt
    if (this.data.receipts[idempotencyKey]) {
      return { allowed: true, existingReceipt: this.data.receipts[idempotencyKey] };
    }
    const priorReceiptId = this.data.idempotencyRecordHashes[recordHash];
    if (priorReceiptId) {
      const existing = Object.values(this.data.receipts).find(r => r.receiptId === priorReceiptId);
      if (existing) {
        return { allowed: true, existingReceipt: existing };
      }
    }

    // 2. Global spending/rate limit check
    if (this.data.globalDailyCount >= this.config.maxGlobalDailyWrites) {
      return { allowed: false, reason: "Global daily Walrus write ceiling reached. Protection active." };
    }

    // 3. Per-wallet quota check
    const normalized = normalizeSuiAddress(walletAddress);
    const quota = this.data.walletQuotas[normalized] || {
      dailyCount: 0,
      lastResetDay: this.data.currentDay,
      totalCount: 0,
    };

    if (quota.dailyCount >= this.config.maxDailyWritesPerWallet) {
      return { allowed: false, reason: `Daily limit of ${this.config.maxDailyWritesPerWallet} confirmations reached for this wallet.` };
    }

    return { allowed: true };
  }

  public recordSuccess(
    idempotencyKey: string,
    receipt: DurableStorageReceipt,
    now = Date.now()
  ): void {
    this.ensureDayRollover(now);
    const normalized = normalizeSuiAddress(receipt.address);

    if (!this.data.walletQuotas[normalized]) {
      this.data.walletQuotas[normalized] = {
        dailyCount: 0,
        lastResetDay: this.data.currentDay,
        totalCount: 0,
      };
    }

    this.data.walletQuotas[normalized].dailyCount++;
    this.data.walletQuotas[normalized].totalCount++;
    this.data.globalDailyCount++;

    this.data.receipts[idempotencyKey] = receipt;
    this.data.idempotencyRecordHashes[receipt.recordHash] = receipt.receiptId;
    this.data.updatedAt = new Date(now).toISOString();
  }

  public getReceiptById(receiptId: string): DurableStorageReceipt | undefined {
    return Object.values(this.data.receipts).find(r => r.receiptId === receiptId);
  }

  public getReceiptsForWallet(address: string): DurableStorageReceipt[] {
    try {
      const normalized = normalizeSuiAddress(address);
      return Object.values(this.data.receipts).filter(r => r.address === normalized);
    } catch {
      return [];
    }
  }

  public async persist(): Promise<void> {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), { encoding: "utf8", mode: 0o600 });
  }

  public static async loadOrCreate(filePath: string, config: StorageSafeguardsConfig): Promise<StorageSafeguardsLedger> {
    try {
      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      if (parsed?.schema === "veyra.safeguard_ledger.v1") {
        return new StorageSafeguardsLedger({ ...config, filePath }, parsed);
      }
    } catch {
      // Create new ledger if file doesn't exist
    }
    return new StorageSafeguardsLedger({ ...config, filePath });
  }
}
