import { strip } from './shared.js';

export const id = 'amber';

const AMBER_HOSTS = new Set(['amberstudent.com', 'www.amberstudent.com', 'amberstudent.keka.com']);
const CAREERS_URL = 'https://amberstudent.com/job-opening';
const FEED_URL = 'https://amberstudent.keka.com/careers/api/jobs/default/active';
const TITLE_KEYS = ['title', 'jobTitle', 'positionTitle', 'designation', 'roleTitle', 'openingTitle'];
const ID_KEYS = ['id', 'jobId', 'jobID', 'jobOpeningId', 'requisitionId', 'jobCode'];

export function matches(url) {
  const host = url.hostname.toLowerCase();
  if (!AMBER_HOSTS.has(host)) return false;
  return host === 'amberstudent.keka.com'
    ? /^\/careers(?:\/|$)/i.test(url.pathname)
    : /^\/job-opening\/?$/i.test(url.pathname);
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
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    !!plainText(firstValue(value, TITLE_KEYS)) && !!plainText(firstValue(value, ID_KEYS));
}

function findJobs(value, depth = 0) {
  if (depth > 7 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.some(looksLikeJob)) return value.filter(looksLikeJob);
    for (const item of value) {
      const nested = findJobs(item, depth + 1);
      if (nested !== null) return nested;
    }
    return value.length === 0 ? [] : null;
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

async function fetchPublicJobs() {
  const response = await fetch(FEED_URL, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': 'JobRadar/1.0 (personal job discovery; public careers feed)',
      referer: `${CAREERS_URL}/`,
      'x-requested-with': 'XMLHttpRequest'
    }
  });
  if (!response.ok) throw new Error(`Amber Keka jobs feed returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error('Amber Keka returned a non-JSON jobs response.');
  }
}

function toJob(row, company) {
  const title = plainText(firstValue(row, TITLE_KEYS));
  const jobId = plainText(firstValue(row, ID_KEYS));
  if (!title || !jobId) return null;

  const url = `https://amberstudent.keka.com/careers/jobdetails/${encodeURIComponent(jobId)}`;
  const description = strip(plainText(firstValue(row, ['description', 'jobDescription', 'descriptionHtml', 'shortDescription', 'summary'])));
  const location = plainText(firstValue(row, ['jobLocations', 'locations', 'location', 'jobLocation', 'locationName', 'city'])) ||
    (description.match(/\bPune\b/i)?.[0] || '');
  const posted = plainText(firstValue(row, ['publishedOn', 'postedAt', 'postedDate', 'datePosted', 'postingDate', 'createdOn']));

  return { company, title, location, posted: posted.slice(0, 30), url, description };
}

export async function fetchPage(source) {
  const rows = findJobs(await fetchPublicJobs());
  if (rows === null) throw new Error('Amber Keka returned an unrecognized jobs format.');

  const jobs = [];
  const seen = new Set();
  for (const row of rows) {
    const job = toJob(row, source.name || 'Amber');
    if (!job || seen.has(job.url)) continue;
    seen.add(job.url);
    jobs.push(job);
  }
  if (rows.length && !jobs.length) throw new Error('Amber Keka listed jobs, but their details could not be read.');

  return { jobs, pageSize: jobs.length, total: jobs.length, skipSitemap: true, shortPage: true, incremental: true };
}
