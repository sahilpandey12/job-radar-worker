import { abs, strip } from './shared.js';

export const id = 'bny';
const API_PATH = '/hcmRestApi/resources/latest/recruitingCEJobRequisitions';
const PAGE_SIZE = 25;
const USER_AGENT = 'JobRadar/1.0 (personal job discovery; respectful public career page fetch)';

export function matches(url) {
  return url.hostname.toLowerCase() === 'eofe.fa.us2.oraclecloud.com'
    && /^\/hcmUI\/CandidateExperience\/[^/]+\/sites\/BNY-Careers\/jobs\/?$/i.test(url.pathname);
}

function getSiteNumber(url) {
  return url.pathname.match(/\/sites\/([^/]+)/i)?.[1] || 'BNY-Careers';
}

function findListing(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 7) return null;
  if (!Array.isArray(value)) {
    if (Array.isArray(value.requisitionList)) return { rows: value.requisitionList, meta: value };
    if (Array.isArray(value.items) && value.items.some(row => row && typeof row === 'object' && (row.Title || row.title) && (row.Id || row.RequisitionId))) {
      return { rows: value.items, meta: value };
    }
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = findListing(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function textValue(value) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ');
  if (typeof value !== 'object') return '';
  return [
    value.LocationName, value.locationName, value.PrimaryLocation, value.primaryLocation,
    value.Name, value.name, value.addressLocality, value.City, value.city,
    value.State, value.state, value.Country, value.country, value.descriptor
  ].filter(Boolean).map(textValue).join(', ');
}

function normalizeJob(row, source, sourceUrl, siteNumber) {
  const title = strip(String(row.Title || row.ExternalJobTitle || row.JobTitle || row.title || ''));
  const reqId = String(row.Id || row.RequisitionId || row.JobId || row.RequisitionNumber || '').trim();
  const externalUrl = row.ExternalUrl || row.ExternalURL || row.JobUrl || row.url || '';
  const locale = sourceUrl.pathname.match(/CandidateExperience\/([^/]+)/i)?.[1] || 'en';
  const url = externalUrl
    ? abs(externalUrl, sourceUrl.href)
    : reqId
      ? abs('/hcmUI/CandidateExperience/' + locale + '/sites/' + encodeURIComponent(siteNumber) + '/job/' + encodeURIComponent(reqId), sourceUrl.origin)
      : '';
  if (!title || !url) return null;

  const location = strip(textValue(
    row.PrimaryLocation || row.primaryLocation || row.LocationsText ||
    row.Location || row.location || row.WorkLocation || row.secondaryLocations || ''
  ));
  const posted = String(row.PostedDate || row.PostingStartDate || row.ExternalPostedStartDate || row.CreationDate || '').slice(0, 40);
  const description = strip(String(row.ShortDescriptionStr || row.ShortDescription || row.ExternalDescriptionStr || row.Description || row.description || ''));
  return { company: source.name || 'BNY', title, location, posted, url, description };
}

function makeApiUrl(sourceUrl, offset, siteNumber) {
  const apiUrl = new URL(API_PATH, sourceUrl.origin);
  const params = sourceUrl.searchParams;
  const finder = ['siteNumber=' + siteNumber];

  const allowedFilters = [
    'keyword', 'q', 'lastSelectedFacet', 'locationId', 'selectedLocationsFacet',
    'radius', 'radiusUnit', 'selectedCategoriesFacet', 'selectedJobFamiliesFacet',
    'selectedPostingDatesFacet'
  ];
  for (const key of allowedFilters) {
    const value = params.get(key);
    if (value) finder.push(key + '=' + value);
  }
  if (params.has('locationId') && !params.has('selectedLocationsFacet')) {
    finder.push('selectedLocationsFacet=' + params.get('locationId'));
  }
  finder.push('limit=' + PAGE_SIZE, 'offset=' + Math.max(0, Number(offset) || 0), 'sortBy=POSTING_DATES_DESC');

  apiUrl.searchParams.set('onlyData', 'true');
  apiUrl.searchParams.set('expand', 'requisitionList.secondaryLocations');
  apiUrl.searchParams.set('finder', 'findReqs;' + finder.join(','));
  return apiUrl.href;
}

export async function fetchPage(source, offset = 0) {
  const sourceUrl = new URL(source.url);
  const siteNumber = getSiteNumber(sourceUrl);
  const apiUrl = makeApiUrl(sourceUrl, offset, siteNumber);
  const response = await fetch(apiUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      referer: sourceUrl.href
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 160).replace(/\s+/g, ' ').trim(); } catch {}
    const error = new Error('BNY Oracle jobs feed HTTP ' + response.status + (detail ? ': ' + detail : ''));
    error.status = response.status;
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('BNY Oracle jobs feed returned a non-JSON response.');
  }

  const listing = findListing(payload);
  if (!listing) throw new Error('BNY Oracle response did not include the expected requisition list.');
  const jobs = listing.rows.map(row => normalizeJob(row, source, sourceUrl, siteNumber)).filter(Boolean);
  if (listing.rows.length && !jobs.length) throw new Error('BNY returned requisitions, but their titles or application links could not be read.');

  const total = Number(listing.meta.TotalJobsCount || listing.meta.totalJobsCount || payload.TotalJobsCount || payload.totalJobsCount) || 0;
  return {
    jobs,
    total,
    pageSize: PAGE_SIZE,
    skipSitemap: true,
    shortPage: true,
    incremental: true
  };
}