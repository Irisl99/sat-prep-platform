const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getToken() {
  return localStorage.getItem('sat_token');
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// ── Auth ──────────────────────────────────────────────────────
export const auth = {
  register: (name, email, password) => request('POST', '/api/auth/register', { name, email, password }),
  login:    (email, password)        => request('POST', '/api/auth/login',    { email, password }),
  me:       ()                       => request('GET',  '/api/auth/me'),
};

// ── Exam ──────────────────────────────────────────────────────
export const exam = {
  start:        ()                        => request('POST', '/api/exam/start'),
  submitModule: (examId, moduleId, answers) =>
    request('POST', `/api/exam/${examId}/submit-module`, { moduleId, answers }),
  results:  (examId) => request('GET',  `/api/exam/${examId}/results`),
  history:  ()       => request('GET',  '/api/exam/history'),
};

// ── Billing ───────────────────────────────────────────────────
export const billing = {
  checkout: (plan) => request('POST', '/api/billing/checkout', { plan }),
  portal:   ()     => request('POST', '/api/billing/portal'),
};
