export const BACKEND = process.env.NEXT_PUBLIC_MONITOR_BACKEND || 'http://localhost:4000'
export const api = {
    get: (path) => fetch(`${BACKEND}/api${path}`).then(r => r.json()),
    post: (path, body) => fetch(`${BACKEND}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    patch: (path, body) => fetch(`${BACKEND}/api${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    del: (path) => fetch(`${BACKEND}/api${path}`, { method: 'DELETE' }).then(r => r.json()),
}

export const d = (val) => val ? new Date(val) : null