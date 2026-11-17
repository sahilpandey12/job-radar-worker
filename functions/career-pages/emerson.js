import { abs, strip } from './shared.js';

export const id = 'emerson';
const API_PATH = '/hcmRestApi/resources/latest/recruitingCEJobRequisitions';
const PAGE_SIZE = 25;
const USER_AGENT = 'JobRadar/1.0 (personal job discovery; respectful public career page fetch)';

export function matches(url) {
  return url.hostname.toLowerCase() === 'hdjq.fa.us2.oraclecloud.com' &&
    /^\/hcmUI\/CandidateExperience\/en\/sites\/CX_1\/jobs\/?$/i.test(url.pathname);
}

function getSiteNumber(url) {
  return url.pathname.match(/\/sites\/([^/]+)/i)?.[1] || 'CX_1';
}

function findListing(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
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

function normalizeJob(row, source, siteUrl, siteNumber) {
  const title = strip(String(row.Title || row.ExternalJobTitle || row.title || row.JobTitle || ''));
  const requisitionId = String(row.Id || row.RequisitionId || row.JobId || row.RequisitionNumber || '').trim();
  const linkedUrl = row.ExternalUrl || row.ExternalURL || row.JobUrl || row.url || '';
  const url = linkedUrl
    ? abs(linkedUrl, siteUrl.href)
    : requisitionId
      ? abs(`/hcmUI/CandidateExperience/en/sites/${encodeURIComponent(siteNumber)}/job/${encodeURIComponent(requisitionId)}`, siteUrl.origin)
      : '';
  if (!title || !url) return null;

  const location = strip(String(row.PrimaryLocation || row.Location || row.location || row.WorkLocation || ''));
  const posted = String(row.PostedDate || row.PostingStartDate || row.CreationDate || row.posted || '').slice(0, 30);
  const description = strip(String(row.ShortDescriptionStr || row.ShortDescription || row.Description || row.description || ''));
  return { company: source.name || 'Emerson', title, location, posted, url, description };
}

function makeApiUrl(sourceUrl, offset, siteNumber) {
  const apiUrl = new URL(API_PATH, sourceUrl.origin);
  const params = sourceUrl.searchParams;
  const finder = [
    `siteNumber=${siteNumber}`,
    `keyword=${params.get('keyword') || ''}`,
    `lastSelectedFacet=${params.get('lastSelectedFacet') || 'LOCATIONS'}`,
    `locationId=${params.get('locationId') || ''}`,
    `selectedLocationsFacet=${params.get('selectedLocationsFacet') || params.get('locationId') || ''}`,
    `radius=${params.get('radius') || '25'}`,
    `radiusUnit=${params.get('radiusUnit') || 'MI'}`,
    `limit=${PAGE_SIZE}`,
    `offset=${Math.max(0, Number(offset) || 0)}`
  ].filter(part => !part.endsWith('='));
  apiUrl.searchParams.set('onlyData', 'true');
  apiUrl.searchParams.set('expand', 'requisitionList');
  apiUrl.searchParams.set('finder', `findReqs;${finder.join(',')}`);
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
    }
  });
  if (!response.ok) throw new Error(`Emerson Oracle jobs feed HTTP ${response.status}`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Emerson Oracle jobs feed returned a non-JSON response.');
  }

  const listing = findListing(payload);
  if (!listing) throw new Error('Emerson Oracle response did not include the expected requisition list.');
  const jobs = listing.rows.map(row => normalizeJob(row, source, sourceUrl, siteNumber)).filter(Boolean);
  if (listing.rows.length && !jobs.length) throw new Error('Emerson listed requisitions, but their titles or job links could not be read.');

  const total = Number(listing.meta.TotalJobsCount || listing.meta.totalJobsCount || payload.TotalJobsCount || payload.totalJobsCount) || 0;
  return {
    jobs,
    total,
    pageSize: PAGE_SIZE,
    skipSitemap: true,
    shortPage: true,
    incremental: false
  };
}
