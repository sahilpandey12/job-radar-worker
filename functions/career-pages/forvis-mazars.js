import { abs, inferLocation, strip } from './shared.js';

export const id = 'forvis-mazars';

export function matches(url) {
  return url.hostname.toLowerCase() === 'careers-asia.forvismazars.com' &&
    (/^\/india\/?$/i.test(url.pathname) || /^\/job-offer\//i.test(url.pathname));
}

function parseForvisJobs(html, baseUrl, company) {
  const jobs = [];
  const seen = new Set();

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href || !/\/job-offer\//i.test(href)) continue;

    const url = abs(href, baseUrl);
    if (!url || seen.has(url)) continue;
    const title = strip(match[2]).replace(/\s+Apply now\s*$/i, '').trim();
    if (!title) continue;

    jobs.push({ company, title, location: inferLocation(title), posted: '', url, description: '' });
    seen.add(url);
  }
  return jobs;
}

export async function fetchPage(source) {
  const url = new URL(source.url);
  const response = await fetch(url.href, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'JobRadar/1.0 (personal job discovery; public career page)',
      'accept-language': 'en-IN,en;q=0.9'
    }
  });
  if (!response.ok) throw new Error(`Forvis Mazars career page returned HTTP ${response.status}.`);

  const jobs = parseForvisJobs(await response.text(), url.href, source.name || 'Forvis Mazars');
  if (!jobs.length) throw new Error('Forvis Mazars page did not return job-offer listings.');
  return { jobs, pageSize: jobs.length, total: jobs.length, skipSitemap: true, shortPage: true, incremental: true };
}
