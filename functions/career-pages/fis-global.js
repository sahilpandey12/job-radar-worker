import { fetchHtmlPage, parseJobs, strip } from './shared.js';

export const id = 'fis-global';
const PAGE_SIZE = 10;

export function matches(url) {
  return url.hostname.toLowerCase() === 'careers.fisglobal.com'
    && /^\/us\/en\/search-results\/?$/i.test(url.pathname);
}

function buildPageUrl(source, offset) {
  const url = new URL(source.url);
  if (offset > 0) {
    url.searchParams.set('from', String(offset));
    url.searchParams.set('s', '1');
  }
  return url.href;
}

function parseFisJobs(html, base, company) {
  return parseJobs(html, base, company).filter(job => {
    try {
      const url = new URL(job.url);
      return url.hostname.toLowerCase() === 'careers.fisglobal.com'
        && /^\/us\/en\/job\//i.test(url.pathname);
    } catch {
      return false;
    }
  });
}

function readPager(html) {
  const text = strip(html);
  const match = text.match(/Showing\s+(\d+)\s*[-–]\s*(\d+)\s+of\s+([\d,]+)\s+jobs/i);
  if (!match) return null;
  return {
    pageSize: Math.max(1, Number(match[2]) - Number(match[1]) + 1),
    total: Number(match[3].replaceAll(',', ''))
  };
}

export async function fetchPage(source, offset = 0, state = {}) {
  const options = {
    buildUrl: buildPageUrl,
    parse: parseFisJobs,
    readPager,
    defaultPageSize: PAGE_SIZE,
    skipSitemap: true,
    shortPage: true,
    incremental: true,
    afterParse(jobs, { html }) {
      if (!jobs.length && /\$\{pageStateData\.(?:searchKeyword|placeVal)\}/i.test(html)) {
        throw new Error('FIS search returned a client-side template instead of job cards. The public search page needs its browser-loaded Phenom listing data for server scraping.');
      }
      return jobs;
    }
  };
  const page = await fetchHtmlPage(source, offset, { ...state, pageSize: PAGE_SIZE }, options);
  return {
    ...page,
    pageSize: page.pageSize || (page.jobs.length ? PAGE_SIZE : 0),
    skipSitemap: true,
    incremental: true
  };
}