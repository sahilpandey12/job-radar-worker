import { abs, strip, unescapeHtml } from './shared.js';

export const id = 'hcltech';

const PAGE_SIZE = 10;
const PAGES_PER_REQUEST = 3;
const USER_AGENT = 'JobRadar/1.0 (personal job discovery; respectful public career page fetch)';

export function matches(url) {
  return url.hostname.toLowerCase() === 'careers.hcltech.com' && /^\/search\/?$/i.test(url.pathname);
}

function readLocation(value) {
  if (Array.isArray(value)) return value.map(readLocation).filter(Boolean).join('; ');
  if (typeof value === 'string') return strip(value);
  if (!value || typeof value !== 'object') return '';
  return strip([
    value.displayName, value.locationName, value.city, value.cityName,
    value.state, value.country, value.name
  ].filter(part => typeof part === 'string' && part.trim()).join(', '));
}

function normalizeRecord(record, source, sourceUrl) {
  const item = record?.response || record;
  if (!item || typeof item !== 'object') return null;

  const title = strip(item.unifiedStandardTitle || item.title || item.jobTitle || item.displayJobTitle || '');
  const jobId = String(item.id || item.jobReqId || item.requisitionId || item.jobId || '').trim();
  const rawUrl = item.url || item.jobUrl || item.externalUrl || item.externalPath || '';
  let url = rawUrl ? abs(rawUrl, sourceUrl.href) : '';

  if (!url && jobId) {
    const slug = String(item.urlTitle || item.unifiedUrlTitle || item.slug || title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')).trim();
    const locale = String(item.supportedLocales?.[0] || item.locale || 'en_US');
    if (slug) url = abs(`/job/${encodeURIComponent(slug)}/${encodeURIComponent(`${jobId}-${locale}`)}`, sourceUrl.origin);
  }

  if (!title || !url) return null;
  const location = readLocation(item.jobLocationShort || item.sfstd_jobLocation_obj || item.jobLocation || item.location || '');
  return {
    company: source.name || 'HCL Tech',
    title,
    location,
    posted: String(item.unifiedStandardStart || item.postingDate || item.datePosted || item.postedOn || ''),
    url,
    description: strip(item.description || item.jobDescription || '')
  };
}

function parseHtmlCards(html, baseUrl, company) {
  const jobs = [];
  const seen = new Set();
  const cards = html.matchAll(/<li\b(?=[^>]*\bdata-testid\s*=\s*["']jobCard["'])[^>]*>([\s\S]*?)<\/li\s*>/gi);
  for (const match of cards) {
    const card = match[1];
    const link = card.match(/<a\b([^>]*\bhref\s*=\s*(["'])(.*?)\2[^>]*)>([\s\S]*?)<\/a\s*>/i);
    if (!link) continue;
    const href = unescapeHtml(link[3]);
    if (!/\/job\//i.test(href)) continue;
    const url = abs(href, baseUrl);
    const title = strip(link[4]);
    if (!url || !title || seen.has(url)) continue;
    const cardText = strip(card);
    const location = cardText.match(/\b(Pune|Remote|Bengaluru|Bangalore|Hyderabad|Mumbai|Delhi|Chennai|India)\b/i)?.[0] || '';
    jobs.push({ company, title, location, posted: '', url, description: '' });
    seen.add(url);
  }
  return jobs;
}

function getPager(html) {
  const text = strip(html);
  const match = text.match(/Results\s+(\d+)\s*(?:–|-|to)\s*(\d+)\s+of\s+([\d,]+)/i);
  return match ? {
    pageSize: Number(match[2]) - Number(match[1]) + 1,
    total: Number(match[3].replaceAll(',', ''))
  } : null;
}

async function fetchFeedPage(source, offset) {
  const sourceUrl = new URL(source.url);
  const apiUrl = new URL('/services/recruiting/v1/jobs', sourceUrl.origin);
  const keywords = sourceUrl.searchParams.get('q') || '';
  const location = sourceUrl.searchParams.get('locationsearch') || '';
  const locale = sourceUrl.searchParams.get('locale') || 'en_US';
  const firstPage = Math.floor(Math.max(0, Number(offset) || 0) / PAGE_SIZE);
  let facetFilters;
  try { facetFilters = JSON.parse(sourceUrl.searchParams.get('facetFilters') || 'null'); } catch { facetFilters = null; }

  const responses = await Promise.all(Array.from({ length: PAGES_PER_REQUEST }, async (_, index) => {
    const response = await fetch(apiUrl.href, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
        referer: sourceUrl.href
      },
      body: JSON.stringify({
        keywords,
        locale,
        location,
        pageNumber: firstPage + index,
        sortBy: 'recent',
        ...(facetFilters ? { facetFilters } : {})
      })
    });
    if (!response.ok) throw new Error(`HCLTech job feed HTTP ${response.status}`);
    return response.json();
  }));

  const first = responses[0] || {};
  const records = responses.flatMap(result => Array.isArray(result.jobSearchResult) ? result.jobSearchResult : []);
  const jobs = records.map(record => normalizeRecord(record, source, sourceUrl)).filter(Boolean);
  if (!jobs.length && records.length) throw new Error('HCLTech job feed returned listings in an unsupported format');
  return {
    jobs,
    total: Number(first.totalJobs || first.total || first.totalCount) || 0,
    pageSize: PAGE_SIZE * PAGES_PER_REQUEST,
    skipSitemap: true,
    shortPage: jobs.length < PAGE_SIZE * PAGES_PER_REQUEST,
    incremental: true
  };
}

async function fetchHtmlPage(source, offset) {
  const sourceUrl = new URL(source.url);
  const pageUrl = new URL(source.url);
  const pageNumber = Math.floor(Math.max(0, Number(offset) || 0) / PAGE_SIZE);
  pageUrl.searchParams.set('pageNumber', String(pageNumber));
  const response = await fetch(pageUrl.href, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-IN,en;q=0.9',
      'user-agent': USER_AGENT
    }
  });
  if (!response.ok) throw new Error(`HCLTech career page HTTP ${response.status}`);
  const html = await response.text();
  const jobs = parseHtmlCards(html, pageUrl.href, source.name || sourceUrl.hostname);
  const pager = getPager(html);
  if (!jobs.length) throw new Error('HCLTech page did not return its job cards');
  return {
    jobs,
    total: pager?.total || jobs.length,
    pageSize: pager?.pageSize || PAGE_SIZE,
    skipSitemap: true,
    shortPage: jobs.length < (pager?.pageSize || PAGE_SIZE),
    incremental: true
  };
}

export async function fetchPage(source, offset = 0) {
  let feedError = '';
  try {
    const result = await fetchFeedPage(source, offset);
    if (result.jobs.length) return result;
    feedError = 'the public job feed returned no listing records';
  } catch (error) {
    feedError = error instanceof Error ? error.message : String(error);
  }

  try {
    return await fetchHtmlPage(source, offset);
  } catch (error) {
    const htmlError = error instanceof Error ? error.message : String(error);
    throw new Error(`${feedError}; ${htmlError}`);
  }
}
