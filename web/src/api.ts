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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
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
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/shorten`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    if (res.status === 409) {
      throw new Error(`That alias "${data.custom_code || ''}" is already taken. Please try another.`);
    }
    if (res.status === 422) {
      throw new Error('Invalid URL format or custom short code.');
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      if (retryAfter) {
        throw new Error(`You've reached the rate limit. Please try again in ${retryAfter} seconds.`);
      }
      throw new Error("You've reached the rate limit. Please try again in a few moments.");
    }
    if (res.status === 503) {
      throw new Error('Service temporarily unavailable. Please try again.');
    }
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Failed to shorten URL (HTTP ${res.status})`);
  }

  return res.json();
}

export async function getStats(
  code: string,
  token: string
): Promise<URLStats> {
  const res = await fetch(`${API_BASE_URL}/stats/${code}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Authentication token required or invalid');
    }
    if (res.status === 404) {
      throw new Error('Short code not found');
    }
    throw new Error(`Failed to fetch stats (HTTP ${res.status})`);
  }

  return res.json();
}

export async function deleteURL(
  code: string,
  token: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/${code}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Authentication token required or invalid');
    }
    if (res.status === 404) {
      throw new Error('Short code not found or already inactive');
    }
    throw new Error(`Failed to delete short URL (HTTP ${res.status})`);
  }
}

export async function getUserURLs(token: string): Promise<URLStats[]> {
  const res = await fetch(`${API_BASE_URL}/user/urls`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Authentication token required or invalid');
    }
    throw new Error(`Failed to fetch user URLs (HTTP ${res.status})`);
  }

  return res.json();
}

export { API_BASE_URL };
