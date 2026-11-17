import { abs, inferLocation, strip } from './shared.js';

export const id = 'accenture';

const WORKDAY_API = 'https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs';
const WORKDAY_BASE = 'https://accenture.wd103.myworkdayjobs.com/AccentureCareers';
const PAGE_SIZE = 20;
// Keep Accenture requests incremental and sequential. Its public feed rate-limits
// bursts, and one page is enough to detect whether new postings were added.
const REQUEST_BATCH = 1;
const MIN_REQUEST_INTERVAL_MS = 2000;
let lastRequestAt = 0;

function retryAfterMs(header) {
  if (header && /^\d+(?:\.\d+)?$/.test(header.trim())) return Math.max(1000, Number(header) * 1000);
  if (header) {
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(1000, date - Date.now());
  }
  return 15 * 60 * 1000;
}

export function matches(url) {
  return url.hostname.toLowerCase() === 'www.accenture.com'
    && /^\/in-en\/careers\/jobsearch\/?$/i.test(url.pathname);
}

function locationText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(locationText).filter(Boolean).join(', ');
  if (typeof value !== 'object') return String(value);

  const address = value.address || value.addressLocality || value.location || '';
  return [value.name, value.locationName, value.descriptor, address, value.addressRegion, value.addressCountry]
    .filter(Boolean)
    .map(part => typeof part === 'string' ? part : locationText(part))
    .join(', ');
}

function parseJob(item, company) {
  const title = strip(item.title || item.postingTitle || '');
  const path = item.externalPath || item.url || '';
  const url = abs(path, WORKDAY_BASE);
  const location = strip(locationText(item.locationsText || item.location || item.primaryLocation || item.additionalLocations));
  const bullets = Array.isArray(item.bulletFields) ? item.bulletFields.join(' ') : item.bulletFields || '';
  const description = strip(item.jobDescription || item.description || bullets);

  if (!title || !url) return null;
  return {
    company,
    title,
    location: location || inferLocation(path),
    posted: String(item.postedOn || item.postingDate || ''),
    url,
    description
  };
}

async function fetchBatch(offset, searchText) {
  const waitMs = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

  const response = await fetch(WORKDAY_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-language': 'en-IN,en;q=0.9',
      'user-agent': 'JobRadar/1.0 (personal job discovery; respectful public career page fetch)',
      referer: `${WORKDAY_BASE}/`
    },
    body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText })
  });
  lastRequestAt = Date.now();

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180).replace(/\s+/g, ' ').trim();
    if (response.status === 429) {
      const error = new Error(`Accenture job feed HTTP 429: site rate limit; retry paused for ${Math.ceil(retryAfterMs(response.headers.get('retry-after')) / 60000)} minute(s).`);
      error.status = 429;
      error.retryAfterMs = retryAfterMs(response.headers.get('retry-after'));
      throw error;
    }
    throw new Error(`Accenture job feed HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  const result = await response.json();
  if (!Array.isArray(result.jobPostings)) {
    throw new Error('Accenture job feed returned an unexpected response.');
  }
  return result;
}

export async function fetchPage(source, offset = 0) {
  const sourceUrl = new URL(source.url);
  const locationNeedle = sourceUrl.searchParams.get('ct')?.trim() || '';
  const pageQuery = sourceUrl.searchParams.get('q')?.trim() || '';

  // Accenture's public page uses its own `ct` location filter. Its Workday
  // feed does not expose that filter as a facet, so use the location as the
  // feed's text query and verify each returned job's location below. The
  // `jt` experience facet is intentionally left to the career page/user.
  const searchText = [pageQuery, locationNeedle].filter(Boolean).join(' ');
  const batchSize = PAGE_SIZE * REQUEST_BATCH;
  const firstOffset = Math.floor(Number(offset || 0) / batchSize) * batchSize;
  const responses = [];
  for (let index = 0; index < REQUEST_BATCH; index++) {
    responses.push(await fetchBatch(firstOffset + index * PAGE_SIZE, searchText));
  }

  const records = responses.flatMap(result => result.jobPostings);
  const totalValue = responses.find(result => Number.isFinite(Number(result.total)))?.total;
  const total = Number(totalValue) || 0;
  const jobs = records
    .map(item => parseJob(item, source.name))
    .filter(job => job && (!locationNeedle || job.location.toLowerCase().includes(locationNeedle.toLowerCase())));

  return {
    jobs,
    total,
    pageSize: batchSize,
    skipSitemap: true,
    shortPage: !total && records.length < batchSize,
    incremental: true
  };
}
