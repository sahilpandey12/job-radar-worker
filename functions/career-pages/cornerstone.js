import { abs, strip } from './shared.js';

export const id='cornerstone';
const PAGE_SIZE=200;
const USER_AGENT='JobRadar/1.0 (personal job discovery; respectful public career page fetch)';

export function matches(url){
  return url.hostname.endsWith('.csod.com')&&/^\/ux\/ats\/careersite\/\d+\/home\/?$/i.test(url.pathname);
}

function getContext(html){
  const match=html.match(/csod\.context\s*=\s*(\{[\s\S]*?\});/);
  if(!match)return null;
  try{return JSON.parse(match[1])}catch{return null}
}

function locationText(job){
  const locations=[...(Array.isArray(job.locations)?job.locations:[])];
  if(job.primaryLocation&&typeof job.primaryLocation==='object')locations.unshift(job.primaryLocation);
  const unique=[];
  for(const location of locations){
    if(typeof location==='string'){if(location.trim())unique.push(strip(location));continue}
    if(!location||typeof location!=='object')continue;
    const parts=[location.title,location.city,location.state,location.country].filter(value=>typeof value==='string'&&value.trim());
    if(parts.length)unique.push(strip(parts.join(', ')));
  }
  return [...new Set(unique)].join('; ');
}

export async function fetchPage(source,offset=0){
  const pageUrl=new URL(source.url),siteId=Number(pageUrl.pathname.match(/\/careersite\/(\d+)\/home/i)?.[1]);
  const htmlResponse=await fetch(pageUrl.href,{headers:{'user-agent':USER_AGENT,'accept':'text/html,application/xhtml+xml','accept-language':'en-IN,en;q=0.9'}});
  if(!htmlResponse.ok)throw Error(`Cornerstone page HTTP ${htmlResponse.status}`);
  const context=getContext(await htmlResponse.text());
  const token=context?.token,cloud=context?.endpoints?.cloud,cultureId=context?.cultureID,cultureName=context?.cultureName||'en-US';
  if(!token||!cloud||!siteId)throw Error('Cornerstone page did not provide its public listing session');
  let cloudUrl;
  try{cloudUrl=new URL(cloud)}catch{throw Error('Cornerstone listing host was invalid')}
  if(cloudUrl.protocol!=='https:'||!/^([a-z0-9-]+)\.api\.csod\.com$/i.test(cloudUrl.hostname))throw Error('Cornerstone listing host was not a supported CSOD API host');

  const keyword=pageUrl.searchParams.get('sq')||pageUrl.searchParams.get('q')||'';
  const location=pageUrl.searchParams.get('lq')||pageUrl.searchParams.get('locationsearch')||'';
  const placeId=pageUrl.searchParams.get('pl')||'';
  const requestBody={
    careerSiteId:siteId,
    careerSitePageId:siteId,
    pageNumber:Math.floor(Math.max(0,Number(offset)||0)/PAGE_SIZE)+1,
    pageSize:PAGE_SIZE,
    cultureId,
    cultureName,
    searchText:keyword,
    states:[],
    countryCodes:[],
    cities:[],
    placeID:placeId,
    radius:'',
    postingsWithinDays:'',
    customFieldCheckboxKeys:[],
    customFieldDropdowns:[],
    customFieldRadios:[]
  };
  // Keep the URL's visible location filter attached to the site's search request.
  if(location&&!placeId)requestBody.searchText=[keyword,location].filter(Boolean).join(' ');

  const response=await fetch(new URL('rec-job-search/external/jobs',cloudUrl).href,{method:'POST',headers:{
    'authorization':`Bearer ${token}`,
    'csod-accept-language':cultureName,
    'accept':'application/json',
    'content-type':'application/json',
    'user-agent':USER_AGENT
  },body:JSON.stringify(requestBody)});
  if(!response.ok)throw Error(`Cornerstone listings HTTP ${response.status}`);
  const envelope=await response.json(),data=envelope?.data||{},records=Array.isArray(data.requisitions)?data.requisitions:[];
  const company=source.name||context.corp||pageUrl.hostname.split('.')[0];
  const jobs=records.map(record=>{
    const requisitionId=String(record.requisitionId||record.id||'').trim();
    const title=strip(record.displayJobTitle||record.title||'');
    if(!requisitionId||!title)return null;
    const postingUrl=new URL(`/ux/ats/careersite/${siteId}/home/requisition/${encodeURIComponent(requisitionId)}`,pageUrl.origin);
    postingUrl.searchParams.set('c',context.corp||pageUrl.searchParams.get('c')||pageUrl.hostname.split('.')[0]);
    return {
      company,
      title,
      location:locationText(record),
      posted:String(record.postingEffectiveDate||record.postingDate||record.datePosted||''),
      url:abs(postingUrl.href,pageUrl.href),
      description:strip(record.externalDescription||record.description||'')
    };
  }).filter(Boolean);
  const total=Number(data.totalCount)||Number(data.total)||jobs.length;
  return {jobs,total,pageSize:PAGE_SIZE,skipSitemap:true,shortPage:jobs.length<PAGE_SIZE,incremental:true};
}
