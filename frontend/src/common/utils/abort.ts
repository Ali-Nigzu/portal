export interface AbortConfig {
  timeoutMs?: number;
  parent?: AbortSignal;
}

export interface AbortBundle {
  signal: AbortSignal;
  cleanup: () => void;
}

export const createAbortSignal = ({ timeoutMs = 15000, parent }: AbortConfig = {}): AbortBundle => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (parent) {
      parent.removeEventListener('abort', handleParentAbort);
    }
  };

  const handleParentAbort = () => {
    controller.abort();
  };

  if (parent) {
    if (parent.aborted) {
      controller.abort(parent.reason);
    } else {
      parent.addEventListener('abort', handleParentAbort);
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
  }

  return { signal: controller.signal, cleanup };
};
