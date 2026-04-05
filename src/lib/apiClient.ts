// src/lib/apiClient.ts

export const getApiBase = () => {
  const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8006';

  if (typeof window !== 'undefined') {
    try {
      const url = new URL(envBase);
      url.hostname = window.location.hostname;
      return url.toString().replace(/\/$/, '');
    } catch (err) {
      console.error('Invalid API base URL:', envBase, err);
    }
  }

  return envBase.replace(/\/$/, '');
};

export const apiFetch = (path: string, options?: RequestInit) =>
  fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });
