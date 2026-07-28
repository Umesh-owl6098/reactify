import { AsyncLocalStorage } from "node:async_hooks";
import type { UsageOperationType } from "@reactify/shared";

export interface UsageExecutionContext {
  ownerId: string;
  generationId: string;
  jobId: string;
  operationType: UsageOperationType;
  attemptNumber: number;
  reservationId: string;
  invocationNumber: number;
  providerInvoked: boolean;
}

const storage = new AsyncLocalStorage<UsageExecutionContext>();

export function runWithUsageContext<T>(context: UsageExecutionContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function getUsageContext(): UsageExecutionContext | undefined {
  return storage.getStore();
}

export function markProviderInvoked(): void {
  const context = storage.getStore();
  if (context) {
    context.providerInvoked = true;
  }
}

export function wasProviderInvoked(): boolean {
  return storage.getStore()?.providerInvoked === true;
}
