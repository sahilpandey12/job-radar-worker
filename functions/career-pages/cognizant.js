import { fetchHtmlPage, strip } from './shared.js';

export const id = 'cognizant';

const PAGE_SIZE = 10;
const PAGES_PER_BATCH = 4;
const BATCH_SIZE = PAGE_SIZE * PAGES_PER_BATCH;

export function matches(url) {
  return url.hostname.toLowerCase() === 'careers.cognizant.com'
    && /^\/(?:india-en|global-en)\/jobs\/?$/i.test(url.pathname);
}

function buildPageUrl(source, offset) {
  const url = new URL(source.url);
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  if (pageNumber > 1) url.searchParams.set('page', String(pageNumber));
  else url.searchParams.delete('page');
  url.hash = '';
  return url.href;
}

function readPager(html) {
  const match = strip(html).match(/Displaying\s+([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)\s+matching\s+jobs/i);
  if (!match) return null;
  const first = Number(match[1].replaceAll(',', ''));
  const last = Number(match[2].replaceAll(',', ''));
  const total = Number(match[3].replaceAll(',', ''));
  return {
    pageSize: Math.max(1, last - first + 1),
    total
  };
}

export async function fetchPage(source, offset = 0, state = {}) {
  const batchOffset = Math.floor(Number(offset || 0) / BATCH_SIZE) * BATCH_SIZE;
  const pageState = { ...state, pageSize: PAGE_SIZE };
  const options = {
    buildUrl: buildPageUrl,
    readPager,
    defaultPageSize: PAGE_SIZE,
    skipSitemap: true,
    shortPage: true,
    incremental: true
  };

  // Keep requests sequential for this board; concurrent page bursts invite 403/429 responses.
  const pages = [];
  for (let index = 0; index < PAGES_PER_BATCH; index++) {
    pages.push(await fetchHtmlPage(source, batchOffset + index * PAGE_SIZE, pageState, options));
  }
  const total = pages.find(page => page.total > 0)?.total || 0;
  const jobs = pages.flatMap(page => page.jobs);

  return {
    jobs,
    pageSize: BATCH_SIZE,
    total,
    skipSitemap: true,
    shortPage: !total && pages.some(page => page.jobs.length < PAGE_SIZE),
    incremental: true
  };
}

export function normalizeJobUrl(jobUrl, sourceUrl) {
  try {
    const url = new URL(jobUrl, sourceUrl);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return jobUrl;
  }
}