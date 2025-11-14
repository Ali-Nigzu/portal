export type LogLevel = 'info' | 'warn' | 'error';

const formatMessage = (namespace: string, message: string): string => {
  return `[${namespace}] ${message}`;
};

const emit = (level: LogLevel, namespace: string, message: string, payload?: unknown) => {
  if (level === 'error') {
    if (payload !== undefined) {
      console.error(formatMessage(namespace, message), payload);
    } else {
      console.error(formatMessage(namespace, message));
    }
    return;
  }

  if (level === 'warn') {
    if (payload !== undefined) {
      console.warn(formatMessage(namespace, message), payload);
    } else {
      console.warn(formatMessage(namespace, message));
    }
    return;
  }

  if (payload !== undefined) {
    console.info(formatMessage(namespace, message), payload);
  } else {
    console.info(formatMessage(namespace, message));
  }
};

export const logInfo = (namespace: string, message: string, payload?: unknown): void => {
  emit('info', namespace, message, payload);
};

export const logWarn = (namespace: string, message: string, payload?: unknown): void => {
  emit('warn', namespace, message, payload);
};

export const logError = (namespace: string, message: string, payload?: unknown): void => {
  emit('error', namespace, message, payload);
};
