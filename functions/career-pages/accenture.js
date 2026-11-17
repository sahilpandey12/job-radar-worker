import { abs, fetchRespectfully, inferLocation, strip } from './shared.js';

export const id = 'accenture';

const WORKDAY_API = 'https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs';
const WORKDAY_BASE = 'https://accenture.wd103.myworkdayjobs.com/AccentureCareers';
const PAGE_SIZE = 20;
const REQUEST_BATCH = 1;

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
  const response = await fetchRespectfully(WORKDAY_API, {
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

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180).replace(/\s+/g, ' ').trim();
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
  // Fetch one page at a time. Parallel page bursts were triggering the feed's 429 rate limit.
  const result = await fetchBatch(firstOffset, searchText);
  const records = result.jobPostings;
  const total = Number(result.total) || 0;
  const jobs = records
    .map(item => parseJob(item, source.name))
    .filter(job => job && (!locationNeedle || job.location.toLowerCase().includes(locationNeedle.toLowerCase())));

  return {
    jobs,
    total,
    pageSize: PAGE_SIZE,
    skipSitemap: true,
    shortPage: !total && records.length < PAGE_SIZE,
    incremental: true
  };
}
