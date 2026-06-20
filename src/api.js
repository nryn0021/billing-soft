let csrfToken = "";

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  if (payload.user?.csrf) csrfToken = payload.user.csrf;
  if (payload.data?.user?.csrf) csrfToken = payload.data.user.csrf;
  return payload;
}

export const api = {
  async session() {
    return request("/api/auth/me");
  },
  async login(username, password, remember) {
    return request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password, remember }) });
  },
  async logout() {
    try { await request("/api/auth/logout", { method: "POST" }); } finally { csrfToken = ""; }
  },
  async changePassword(password) {
    const result = await request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ password }) });
    csrfToken = "";
    return result;
  },
  async createBill(bill) {
    return request("/api/bills", { method: "POST", body: JSON.stringify(bill) });
  },
  async updateRate(productId, rate) {
    return request(`/api/products/${encodeURIComponent(productId)}/rate`, { method: "PATCH", body: JSON.stringify({ rate }) });
  },
  async users() {
    return request("/api/users");
  },
  async createUser(user) {
    return request("/api/users", { method: "POST", body: JSON.stringify(user) });
  },
};
