import { abs, strip } from './shared.js';

export const id = 'wipro';
const PAGE_SIZE = 10;
const REQUEST_BATCH = 4;

export function matches(url) {
  return url.hostname === 'careers.wipro.com' && /^\/search\/?$/i.test(url.pathname);
}

export async function fetchPage(source, offset) {
  const sourceUrl = new URL(source.url);
  const locale = sourceUrl.searchParams.get('locale') || 'en_US';
  const keywords = sourceUrl.searchParams.get('q') || '';
  const location = sourceUrl.searchParams.get('locationsearch') || '';
  const firstPage = Math.floor(offset / PAGE_SIZE);
  const apiUrl = new URL('/services/recruiting/v1/jobs', sourceUrl.origin);

  const responses = await Promise.all(Array.from({ length: REQUEST_BATCH }, async (_, index) => {
    const response = await fetch(apiUrl.href, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'JobRadar/1.0 (personal job discovery; respectful public career page fetch)'
      },
      body: JSON.stringify({
        keywords,
        locale,
        location,
        pageNumber: firstPage + index,
        sortBy: 'recent'
      })
    });
    if (!response.ok) throw Error(`Wipro search HTTP ${response.status}`);
    return response.json();
  }));

  const records = responses.flatMap(result => result.jobSearchResult || []);
  const total = Number(responses[0]?.totalJobs) || 0;
  const jobs = records.map(record => {
    const item = record.response || record;
    const jobId = String(item.id || '');
    const slug = String(item.urlTitle || item.unifiedUrlTitle || '').trim();
    const jobLocale = item.supportedLocales?.[0] || locale;
    if (!jobId || !slug) return null;

    const url = abs(`${sourceUrl.origin}/job/${encodeURIComponent(slug)}/${encodeURIComponent(`${jobId}-${jobLocale}`)}/`, sourceUrl.href);
    const rawLocation = Array.isArray(item.jobLocationShort)
      ? item.jobLocationShort[0]
      : item.sfstd_jobLocation_obj?.[0] || '';
    return url ? {
      company: source.name.replace(/\s*[-–]\s*Pune$/i, '') || source.name,
      title: strip(item.unifiedStandardTitle || item.title || ''),
      location: strip(rawLocation),
      posted: String(item.unifiedStandardStart || item.postingDate || ''),
      url,
      description: ''
    } : null;
  }).filter(job => job && job.title);

  const batchSize = PAGE_SIZE * REQUEST_BATCH;
  return {
    jobs,
    total,
    pageSize: batchSize,
    skipSitemap: true,
    shortPage: !total && records.length < batchSize,
    incremental: true
  };
}