async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch("/api" + path, opts);

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${method} /api${path} failed: ${res.status} ${res.statusText} ${txt}`.slice(0, 400));
  }

  if (res.status === 204) return null;

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    return txt ? { raw: txt } : null;
  }
  return res.json();
}

function resolvePhotoUrl(url) {
  return url ? "/api/photo?url=" + encodeURIComponent(url) : "";
}