let activeSessionRestoreId = 0;
let initialSessionRestoreStarted = false;

export function beginSessionRestore(): number {
  activeSessionRestoreId += 1;
  return activeSessionRestoreId;
}

export function isSessionRestoreCurrent(restoreId: number): boolean {
  return restoreId === activeSessionRestoreId;
}

export function invalidateSessionRestore(): void {
  activeSessionRestoreId += 1;
}

export function shouldStartInitialSessionRestore(): boolean {
  if (initialSessionRestoreStarted) {
    return false;
  }

  initialSessionRestoreStarted = true;
  return true;
}

export function resetInitialSessionRestoreFlag(): void {
  initialSessionRestoreStarted = false;
}
