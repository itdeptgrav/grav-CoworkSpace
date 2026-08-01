/**
 * Coworking/lib/mrfApi.js
 *
 * Single client for the MRF flow (Employee → Primary Manager/TL → Store).
 * Same shape as lib/coworkApi.js — prefixes NEXT_PUBLIC_API_URL, attaches a
 * fresh Firebase ID token per request, throws on non-JSON.
 *
 * Add endpoints here rather than calling fetch inline.
 */
import { firebaseAuth } from "./coworkFirebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const ROOT = `${BASE}/api/cowork/mrf`;

async function authHeaders() {
  try {
    const token = await firebaseAuth.currentUser?.getIdToken();
    return token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
  } catch {
    return { "Content-Type": "application/json" };
  }
}

async function request(path, { method = "GET", body, ...rest } = {}) {
  const headers = await authHeaders();
  const res = await fetch(`${ROOT}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...rest,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Server returned a non-JSON response (status ${res.status}).`);
  }
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.append(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ── Reference data ────────────────────────────────────────────────────────
export const fetchCategories = () => request("/data/categories");
export const fetchUnits = () => request("/data/units");
export const searchRawItems = (search) => request(`/data/raw-items${qs({ search })}`);

/** Who approves my requests, and will they be auto-forwarded to the Store? */
export const fetchMyApprover = () => request("/my-approver");

// ── Requester ─────────────────────────────────────────────────────────────
export const listMyMrfs = (filters = {}) => request(qs(filters));
export const createMrf = (payload) => request("", { method: "POST", body: payload });
export const cancelMrf = (id, cancellationNote = "") =>
  request(`/${id}/cancel`, { method: "PATCH", body: { cancellationNote } });

// ── TL / Primary Manager ──────────────────────────────────────────────────
export const listApprovals = (filters = {}) => request(`/approvals${qs(filters)}`);
export const approveMrf = (id, { itemDecisions, note } = {}) =>
  request(`/${id}/tl-approve`, { method: "PATCH", body: { itemDecisions, note } });
export const rejectMrf = (id, note) =>
  request(`/${id}/tl-reject`, { method: "PATCH", body: { note } });

// ── Detail ────────────────────────────────────────────────────────────────
export const fetchMrf = (id) => request(`/${id}`);

// ── Product registration requests — LEGACY, read/resolve only ─────────────
// Every material request (catalogued or not) is a plain MRF now — see
// createMrf. Nothing creates a new one of these any more; these three stay
// only so a request that was still open before this changed can still be
// seen and decided instead of stranded.
export const listProductRequests = () => request("/product-requests");
export const approveProductRequest = (id) =>
  request(`/product-requests/${id}/tl-approve`, { method: "PATCH" });
export const rejectProductRequest = (id, note) =>
  request(`/product-requests/${id}/tl-reject`, { method: "PATCH", body: { note } });

// ── Request-scoped chat ───────────────────────────────────────────────────
// Works for both material requests and new-product requests — pass
// subjectType "PRODUCT_REQUEST" for the latter. Same thread mechanism, same
// participants (requester, TL, Store).
const chatBase = (id, subjectType) =>
  subjectType === "PRODUCT_REQUEST" ? `/product-requests/${id}` : `/${id}`;

export const fetchMrfChat = (id, opts = {}, subjectType = "MRF") =>
  request(`${chatBase(id, subjectType)}/chat${qs(opts)}`);
export const sendMrfChat = (id, { body, attachments = [] }, subjectType = "MRF") =>
  request(`${chatBase(id, subjectType)}/chat`, { method: "POST", body: { body, attachments } });
export const markMrfChatRead = (id, subjectType = "MRF") =>
  request(`${chatBase(id, subjectType)}/chat/read`, { method: "PATCH" });

/**
 * Upload a product photo. Goes through the app's own Cloudinary route handler
 * (app/api/cloudinary/upload) so the API secret stays server-side.
 * Returns { url, publicId, name } ready to attach to an MRF item.
 */
export async function uploadProductImage(file, folder = "mrf-products") {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);

  const res = await fetch("/api/cloudinary/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.details || data.error || "Image upload failed");
  }
  return { url: data.url, publicId: data.publicId, name: file.name };
}
