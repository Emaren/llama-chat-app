// src/lib/apiClient.ts

function normalizeBase(value: string) {
  return value.replace(/\/$/, '');
}

export const getApiBase = () => {
  const envBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (envBase) {
    return normalizeBase(envBase);
  }

  // Production nginx proxies /api/ -> 127.0.0.1:3350/api/
  // and app.main mounts chat routes under /api/chat.
  return '/api/chat';
};

export const apiFetch = (path: string, options?: RequestInit) =>
  fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });
