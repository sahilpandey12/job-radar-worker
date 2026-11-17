function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function validTarget(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    if (host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
    const expected = env.FETCH_PROXY_TOKEN;
    if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let input;
    try { input = await request.json(); }
    catch { return json({ error: 'Invalid request body' }, 400); }

    const target = validTarget(input?.url);
    if (!target) return json({ error: 'Only public HTTPS career-site URLs are accepted' }, 400);

    const method = String(input.method || 'GET').toUpperCase();
    if (!/^[A-Z]{3,10}$/.test(method) || ['CONNECT', 'TRACE'].includes(method)) {
      return json({ error: 'Unsupported request method' }, 400);
    }

    const headers = new Headers();
    if (input.headers && typeof input.headers === 'object') {
      for (const [name, value] of Object.entries(input.headers)) {
        const key = name.toLowerCase();
        if (['host', 'content-length', 'connection', 'transfer-encoding', 'authorization', 'cookie', 'proxy-authorization'].includes(key)) continue;
        if (typeof value === 'string') headers.set(name, value);
      }
    }

    const body = ['GET', 'HEAD'].includes(method) || input.body == null ? undefined : String(input.body);
    if (body && body.length > 2_000_000) return json({ error: 'Request body is too large' }, 413);

    try {
      const upstream = await fetch(target.href, { method, headers, body, redirect: 'follow' });
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set('cache-control', 'no-store');
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders
      });
    } catch (error) {
      return json({ error: `Career-site request failed: ${String(error?.message || error).slice(0, 200)}` }, 502);
    }
  }
};
