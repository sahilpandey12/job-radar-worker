import { fetchText, strip } from './shared.js';

export const id = 'academian';

const ACADEMIAN_HOST = 'academian.keka.com';
const CAREERS_URL = `https://${ACADEMIAN_HOST}/careers/`;
const LEGACY_JOBS_API = `https://${ACADEMIAN_HOST}/careers/api/embedjobs/default/active/`;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TITLE_KEYS = ['title', 'jobTitle', 'positionTitle', 'designation', 'roleTitle', 'openingTitle', 'postingTitle', 'jobName'];
const ID_KEYS = ['id', 'jobId', 'jobID', 'jobOpeningId', 'jobOpeningID', 'requisitionId', 'jobRequisitionId', 'jobPostingId', 'jobCode'];
const URL_KEYS = ['jobUrl', 'jobURL', 'jobDetailsUrl', 'postingUrl', 'url', 'externalUrl', 'careerPageUrl', 'jobLink'];

export function matches(url) {
  const host = url.hostname.toLowerCase();
  const careersPath = /^\/careers?(?:\/|$)/i.test(url.pathname);
  return careersPath && (host === 'academian.com' || host === 'www.academian.com' || host === ACADEMIAN_HOST);
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function plainText(value, depth = 0) {
  if (value === undefined || value === null || depth > 3) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return value.map(item => plainText(item, depth + 1)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    for (const key of ['name', 'displayName', 'title', 'label', 'value', 'text', 'city', 'locationName']) {
      const text = plainText(value[key], depth + 1);
      if (text) return text;
    }
  }
  return '';
}

function looksLikeJob(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return !!plainText(firstValue(value, TITLE_KEYS)) &&
    (!!plainText(firstValue(value, ID_KEYS)) || !!plainText(firstValue(value, URL_KEYS)));
}

function findJobs(value, depth = 0) {
  if (depth > 7 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    if (value.some(looksLikeJob)) return value.filter(looksLikeJob);
    for (const item of value) {
      const nested = findJobs(item, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if (looksLikeJob(value)) return [value];

  const preferredKeys = ['jobs', 'activeJobs', 'jobList', 'jobOpenings', 'jobPostings', 'openings', 'positions', 'items', 'results', 'records', 'data', 'result'];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const nested = findJobs(value[key], depth + 1);
    if (nested !== null) return nested;
  }
  for (const [key, child] of Object.entries(value)) {
    if (preferredKeys.includes(key)) continue;
    const nested = findJobs(child, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

function discoverFeedId(html) {
  const normalized = html
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;|&#47;/gi, '/');
  const patterns = [
    new RegExp(`ats/documents/(${UUID})/careerportal`, 'i'),
    new RegExp(`embedjobs/(?:js|default/active)/(${UUID})`, 'i'),
    new RegExp(`(?:careerPortalId|careerportalId|feedId|embedId)[^0-9a-f]{0,20}(${UUID})`, 'i')
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function extractPortal(html) {
  const normalized = html.replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  return normalized.match(/\/careers\/api\/jobs\/([a-z0-9_-]+)\/active/i)?.[1] || 'default';
}

function postingUrl(job, jobId) {
  const raw = plainText(firstValue(job, URL_KEYS));
  if (raw) {
    try {
      const candidate = new URL(raw, CAREERS_URL);
      if (candidate.hostname.toLowerCase() === ACADEMIAN_HOST && /^\/careers\/(?:jobdetails\/[^/]+|\d+)\/?$/i.test(candidate.pathname)) return candidate.href;
    } catch {}
  }
  return jobId ? `${CAREERS_URL}jobdetails/${encodeURIComponent(jobId)}` : '';
}

function toJob(job, company) {
  const title = plainText(firstValue(job, TITLE_KEYS));
  const jobId = plainText(firstValue(job, ID_KEYS));
  const url = postingUrl(job, jobId);
  if (!title || !url) return null;

  const locations = firstValue(job, ['locations', 'jobLocations', 'location', 'jobLocation', 'locationName', 'workLocation', 'city']);
  const location = plainText(locations);
  const posted = plainText(firstValue(job, ['postedAt', 'postedDate', 'datePosted', 'postingDate', 'publishedDate', 'createdOn', 'createdDate']));
  const description = strip(plainText(firstValue(job, ['description', 'jobDescription', 'descriptionHtml', 'shortDescription', 'summary', 'roleDescription'])));

  return { company, title, location, posted: posted.slice(0, 30), url, description };
}

async function fetchFeedJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'JobRadar/1.0 (personal job discovery; public careers feed)',
        referer: CAREERS_URL,
        'x-requested-with': 'XMLHttpRequest'
      }
    });
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new Error('Academian Keka returned a non-JSON jobs response.');
      }
    }
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 3000) : 700;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(`Academian Keka jobs feed returned HTTP ${response.status}.`);
  }
  throw new Error('Academian Keka jobs feed is temporarily unavailable.');
}

async function fetchPublicJobs() {
  const errors = [];
  try {
    const page = await fetchText(CAREERS_URL);
    const portal = extractPortal(page);
    const feedId = discoverFeedId(page);
    const currentApi = `https://${ACADEMIAN_HOST}/careers/api/jobs/${portal}/active`;
    try {
      return await fetchFeedJson(currentApi);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (feedId) {
      try {
        return await fetchFeedJson(`${LEGACY_JOBS_API}${feedId}`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  throw new Error(`Academian public careers feed could not be read: ${errors.join(' | ') || 'no public feed was found'}`);
}

export async function fetchPage(source) {
  // Keka's current public jobs endpoint no longer needs the old embed-feed UUID.
  // Keep the legacy endpoint as a fallback for career pages that still publish it.
  const payload = await fetchPublicJobs();
  const rows = findJobs(payload);
  if (rows === null) throw new Error('Academian Keka returned an unrecognized jobs format; no jobs were saved.');

  const jobs = [];
  const seen = new Set();
  for (const row of rows) {
    const job = toJob(row, source.name || 'Academian');
    if (!job || seen.has(job.url)) continue;
    seen.add(job.url);
    jobs.push(job);
  }
  if (rows.length && !jobs.length) throw new Error('Academian Keka listed jobs, but their details could not be read.');

  return {
    jobs,
    pageSize: jobs.length,
    total: jobs.length,
    skipSitemap: true,
    shortPage: true,
    incremental: true
  };
}
