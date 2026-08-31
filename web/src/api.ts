export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname
    ? `http://${window.location.hostname}:8000`
    : 'http://localhost:8000');

export const getShortUrl = (code: string): string => {
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/${code}`;
  }
  return `https://trimto.me/${code}`;
};

export const getShortHost = (): string => {
  if (typeof window !== 'undefined' && window.location.host) {
    return `${window.location.host}/`;
  }
  return 'trimto.me/';
};

export interface CreateURLRequest {
  long_url: string;
  custom_code?: string;
  expires_at?: string;
}

export interface CreateURLResponse {
  short_url: string;
  short_code: string;
}

export interface URLStats {
  short_code: string;
  long_url: string;
  created_at: string;
  expires_at?: string;
  click_count: number;
  is_active: boolean;
}

export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url?: string;
}

export interface HistoryItem {
  short_code: string;
  short_url: string;
  long_url: string;
  created_at: string;
  expires_at?: string;
  click_count?: number;
  is_active?: boolean;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function shortenURL(
  data: CreateURLRequest,
  token?: string
): Promise<CreateURLResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const res = await fetch(`${API_BASE_URL}/shorten`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    // If 401 unauthorized because of stale/expired token, automatically retry anonymously
    if (res.status === 401 && token) {
      delete headers['Authorization'];
      const retryRes = await fetch(`${API_BASE_URL}/shorten`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      if (retryRes.ok) {
        const json = await retryRes.json();
        return {
          short_code: json.short_code,
          short_url: getShortUrl(json.short_code),
        };
      }
    }

    if (res.status === 409) {
      throw new Error(`That alias "${data.custom_code || ''}" is already taken. Please try another.`);
    }
    if (res.status === 422) {
      throw new Error('Invalid URL format or custom short code.');
    }
    if (res.status === 429) {
      throw new Error("You've reached the rate limit. Please try again in a few moments.");
    }
    if (res.status === 503) {
      throw new Error('Service temporarily unavailable. Please try again.');
    }

    const err = await res.json().catch(() => ({ error: `Failed to shorten URL (HTTP ${res.status})` }));
    throw new Error(err.error || `Failed to shorten URL (HTTP ${res.status})`);
  }

  const json = await res.json();
  return {
    short_code: json.short_code,
    short_url: getShortUrl(json.short_code),
  };
}

export async function getStats(code: string, token?: string): Promise<URLStats> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const res = await fetch(`${API_BASE_URL}/stats/${encodeURIComponent(code)}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Short code "/${code}" not found.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Sign in with the owner account to view analytics.');
    }
    const err = await res.json().catch(() => ({ error: 'Failed to fetch analytics' }));
    throw new Error(err.error || 'Failed to fetch analytics');
  }

  return res.json();
}

export async function getUserURLs(token: string): Promise<URLStats[]> {
  const res = await fetch(`${API_BASE_URL}/user/urls`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token.trim()}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Unauthorized');
    }
    const err = await res.json().catch(() => ({ error: 'Failed to fetch user links' }));
    throw new Error(err.error || 'Failed to fetch user links');
  }

  return res.json();
}

export async function deleteURL(code: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/urls/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token.trim()}`,
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Short code "/${code}" not found.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('You do not have permission to delete this link.');
    }
    const err = await res.json().catch(() => ({ error: 'Failed to delete URL' }));
    throw new Error(err.error || 'Failed to delete URL');
  }
}
