import { abs, fetchText, parseJobs, strip, unescapeHtml } from './shared.js';

export const id = 'tata-technologies';
const PAGE_SIZE = 20;

export function matches(url) {
  return url.hostname.toLowerCase() === 'tatatechnologies.ripplehire.com'
    && /^\/candidate\/?$/i.test(url.pathname);
}

function asText(value) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (typeof value !== 'object') return '';
  return [
    value.name, value.label, value.locationName, value.location,
    value.city, value.state, value.country, value.address
  ].filter(Boolean).map(asText).join(', ');
}

function addRow(row, source, base, jobs, seen) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return;
  const title = strip(String(row.jobTitle || row.title || row.roleTitle || row.positionTitle || row.postingTitle || row.name || ''));
  const href = row.jobUrl || row.jobURL || row.detailUrl || row.jobDetailUrl || row.applyUrl || row.externalUrl || row.url || row.link || '';
  const url = abs(String(href), base);
  if (!title || !url || !/ripplehire\.com$/i.test(new URL(url).hostname)) return;
  const canonical = url;
  if (seen.has(canonical)) return;
  seen.add(canonical);
  jobs.push({
    company: source.name || 'Tata Technologies',
    title,
    location: strip(asText(row.jobLocation || row.location || row.workLocation || row.locations || row.city || '')),
    posted: String(row.postedDate || row.datePosted || row.postingDate || row.createdDate || '').slice(0, 40),
    url,
    description: strip(String(row.jobDescription || row.description || row.roleDescription || row.summary || ''))
  });
}

function collectRows(value, source, base, jobs, seen, depth = 0) {
  if (!value || depth > 8) return;
  if (Array.isArray(value)) {
    for (const child of value) collectRows(child, source, base, jobs, seen, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  addRow(value, source, base, jobs, seen);
  for (const child of Object.values(value)) collectRows(child, source, base, jobs, seen, depth + 1);
}

function embeddedJobs(html, source, base) {
  const jobs = [], seen = new Set();
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1].trim();
    if (!body || (!body.startsWith('{') && !body.startsWith('['))) continue;
    try { collectRows(JSON.parse(body), source, base, jobs, seen); } catch {}
  }
  for (const job of parseJobs(html, base, source.name || 'Tata Technologies')) {
    if (!/ripplehire\.com$/i.test(new URL(job.url).hostname) || seen.has(job.url)) continue;
    seen.add(job.url);
    jobs.push(job);
  }
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = unescapeHtml(match[1]);
    if (!/(job|role|opening|position|vacanc)/i.test(href)) continue;
    const url = abs(href, base), title = strip(match[2]);
    if (!url || !title || /^(apply|view|know more|read more)$/i.test(title)) continue;
    if (!/ripplehire\.com$/i.test(new URL(url).hostname) || seen.has(url)) continue;
    seen.add(url);
    const nearby = strip(html.slice(Math.max(0, match.index - 500), Math.min(html.length, match.index + 1200)));
    const location = nearby.match(/\b(Pune|Bengaluru|Bangalore|Hyderabad|Mumbai|Chennai|Remote)\b/i)?.[0] || '';
    const date = nearby.match(/\b(?:Posted|Posting Date)\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w{3,9}\s+\d{1,2},?\s+\d{4})/i)?.[1] || '';
    jobs.push({ company: source.name || 'Tata Technologies', title, location, posted: date, url, description: '' });
  }
  return jobs;
}

function readPager(html) {
  const text = strip(html);
  const match = text.match(/(?:Showing\s+)?(\d+)\s*[-–]\s*(\d+)\s+of\s+([\d,]+)\s+(?:jobs|roles)/i);
  if (!match) return null;
  return {
    pageSize: Math.max(1, Number(match[2]) - Number(match[1]) + 1),
    total: Number(match[3].replaceAll(',', ''))
  };
}

function buildPageUrl(source, offset) {
  const url = new URL(source.url);
  if (offset > 0) url.searchParams.set('page', String(Math.floor(offset / PAGE_SIZE) + 1));
  return url.href;
}

export async function fetchPage(source, offset = 0, state = {}) {
  const sourceUrl = new URL(source.url);
  const url = buildPageUrl(sourceUrl, offset);
  const html = await fetchText(url);
  const jobs = embeddedJobs(html, source, url);
  const pager = readPager(html);
  const pageSize = pager?.pageSize || Number(state.pageSize) || (jobs.length ? PAGE_SIZE : 0);
  const total = pager?.total || Number(state.total) || 0;

  if (!jobs.length && /(?:__NEXT_DATA__|__INITIAL_STATE__|ripplehire|candidate-app|app-root)/i.test(html)) {
    throw new Error('RippleHire returned its client-side shell without public job listings. The Pune and experience filters in this URL are browser-side; the scraper needs the board’s public listing request to read the jobs.');
  }

  return {
    jobs,
    total,
    pageSize,
    skipSitemap: true,
    shortPage: pageSize > 0 && jobs.length < pageSize,
    incremental: true
  };
}