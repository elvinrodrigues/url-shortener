export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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
        return retryRes.json();
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

  return res.json();
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
    if (res.status === 401) {
      throw new Error('Sign in required to view stats for this private link.');
    }
    const err = await res.json().catch(() => ({ error: 'Failed to retrieve link stats' }));
    throw new Error(err.error || `Server error (${res.status})`);
  }

  return res.json();
}

export async function deleteURL(code: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token.trim()}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Sign in required to deactivate this link.');
    }
    const err = await res.json().catch(() => ({ error: 'Failed to deactivate URL' }));
    throw new Error(err.error || `Server error (${res.status})`);
  }
}

export async function getUserURLs(token: string): Promise<URLStats[]> {
  if (!token || !token.trim()) return [];

  const res = await fetch(`${API_BASE_URL}/user/urls`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token.trim()}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      // Stale or expired token
      throw new Error('Session expired. Please sign in again.');
    }
    const err = await res.json().catch(() => ({ error: 'Failed to fetch user links' }));
    throw new Error(err.error || `Server error (${res.status})`);
  }

  return res.json();
}
