const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const response = await fetch(url, config);
  
  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || 'An error occurred',
      response.status,
      data
    );
  }

  return data;
}

const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  
  delete: (endpoint, body) => request(endpoint, { method: 'DELETE', body }),
  
  upload: (endpoint, formData) => request(endpoint, {
    method: 'POST',
    body: formData,
  }),
};

/**
 * Safely parse regions from a template - handles double-stringified JSON
 */
export function parseRegions(regions) {
  if (Array.isArray(regions)) return regions;
  if (typeof regions === 'string') {
    try { return JSON.parse(regions); } catch { return []; }
  }
  return [];
}

export default api;
export { ApiError };
