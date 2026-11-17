export const strip = (s='') => unescapeHtml(s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());

export function unescapeHtml(s='') {
  return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
}

export function abs(href,base) {
  try { const u=new URL(unescapeHtml(href),base); return ['https:','http:'].includes(u.protocol)?u.href:''; }
  catch { return ''; }
}

export function inferLocation(text='') {
  const patterns=[[ /\bPune\b/i,'Pune' ],[ /\bRemote\b|\bWork from Home\b|\bWFH\b/i,'Remote' ],[ /\bBengaluru\b|\bBangalore\b/i,'Bengaluru' ],[ /\bHyderabad\b/i,'Hyderabad' ],[ /\bMumbai\b/i,'Mumbai' ],[ /\bDelhi\b|\bNew Delhi\b/i,'Delhi' ],[ /\bGurugram\b|\bGurgaon\b/i,'Gurugram' ],[ /\bNoida\b/i,'Noida' ],[ /\bChennai\b/i,'Chennai' ],[ /\bKolkata\b/i,'Kolkata' ],[ /\bAhmedabad\b/i,'Ahmedabad' ],[ /\bJaipur\b/i,'Jaipur' ],[ /\bIndore\b/i,'Indore' ],[ /\bKochi\b/i,'Kochi' ],[ /\bCoimbatore\b/i,'Coimbatore' ],[ /\bNagpur\b/i,'Nagpur' ]];
  return patterns.find(([re])=>re.test(text))?.[1]||'';
}

export function parseJobs(html,base,company) {
  const jobs=[],seen=new Set();
  const add=o=>{
    const url=abs(o.url||o.urlTemplate,base);let titleText=typeof o.title==='string'?o.title:(o.title?.name||'');
    try{const u=new URL(url);if(u.hostname==='www.accenture.com'&&/^\/in-en\/careers\/jobdetails\/?$/i.test(u.pathname))titleText=titleText||u.searchParams.get('title')||''}catch{}
    const title=strip(titleText);let canonical=url.split('?')[0];
    try{const u=new URL(url);if(u.hostname==='www.accenture.com'&&/^\/in-en\/careers\/jobdetails\/?$/i.test(u.pathname))canonical=`${u.origin}${u.pathname}?id=${u.searchParams.get('id')||''}`}catch{}
    if(!url||!title||seen.has(canonical))return;seen.add(canonical);
    const loc=o.jobLocation?.[0]?.address||o.jobLocation?.address||o.location||{};
    const rawLocation=typeof loc==='string'?loc:[loc.addressLocality,loc.addressRegion,loc.addressCountry].filter(Boolean).join(', ');
    const location=inferLocation(title)||strip(rawLocation);
    jobs.push({company,title,location,posted:String(o.datePosted||o.postingDate||o.date||'').slice(0,30),url,description:strip(o.description||'')});
  };
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const v=JSON.parse(m[1]);for(const x of(Array.isArray(v)?v:[v]))for(const o of[x,...(x['@graph']||[])])if(o['@type']==='JobPosting'||(Array.isArray(o['@type'])&&o['@type'].includes('JobPosting')))add(o)}catch{}
  }
  for(const m of html.matchAll(/<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi)){
    if(!/(\/jobs?\/|jobdetail|job-details|jobposting|job-posting|vacancy)/i.test(m[2]))continue;
    let title=strip(m[3]);try{const u=new URL(unescapeHtml(m[2]),base);if(u.hostname==='www.accenture.com'&&/^\/in-en\/careers\/jobdetails\/?$/i.test(u.pathname))title=title||u.searchParams.get('title')||''}catch{}
    if(!title)title=decodeURIComponent(m[2].split('/').filter(Boolean).at(-1)||'').replace(/[-_]+/g,' ').replace(/\s+\d.*$/,'');
    const row=html.slice(Math.max(0,m.index-700),Math.min(html.length,m.index+1300)),loc=row.match(/(?:Pune|Remote|Hybrid|Bengaluru|Bangalore|Hyderabad|Mumbai|Delhi|India)(?:[,\s-]+(?:IN|India|Maharashtra|Karnataka|Telangana))?/i),date=row.match(/(?:Posted|Posting Start Date|Date Posted)?\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w{3,9}\s+\d{1,2},?\s+\d{4})/i);
    add({title,url:m[2],location:loc?.[0]||'',datePosted:date?.[1]||''});
  }
  return jobs;
}

const sleep = ms => new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
const requestTails = new Map();
const lastRequestAt = new Map();
const MIN_ORIGIN_INTERVAL_MS = 1200;

async function queuedFetch(origin,request) {
  const previous=requestTails.get(origin)||Promise.resolve();
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  const tail=previous.catch(()=>{}).then(()=>gate);
  requestTails.set(origin,tail);
  await previous.catch(()=>{});
  const waitMs=MIN_ORIGIN_INTERVAL_MS-(Date.now()-(lastRequestAt.get(origin)||0));
  if(waitMs>0)await sleep(waitMs);
  try{
    lastRequestAt.set(origin,Date.now());
    return await request();
  }finally{
    release();
    if(requestTails.get(origin)===tail)requestTails.delete(origin);
  }
}

function retryAfterMs(value) {
  if(!value)return null;
  const seconds=Number(value);
  if(Number.isFinite(seconds))return Math.max(0,seconds*1000);
  const date=Date.parse(value);
  return Number.isFinite(date)?Math.max(0,date-Date.now()):null;
}

function requestError(message,status,cooldownMs=0) {
  const error=new Error(message);
  error.status=status;
  error.blockedBySite=status===403;
  error.cooldownUntil=cooldownMs?new Date(Date.now()+cooldownMs).toISOString():'';
  return error;
}

export async function fetchRespectfully(url,options={}) {
  const origin=new URL(url).origin;
  let transientRetries=0,rateLimitRetries=0;
  while(true){
    let response;
    try{
      response=await queuedFetch(origin,()=>fetch(url,options));
    }catch(error){
      if(transientRetries++<1){await sleep(1500);continue}
      throw requestError(`Network request failed: ${String(error?.message||error).slice(0,140)}`,0,5*60*1000);
    }
    if(response.status===429){
      const serverWait=retryAfterMs(response.headers.get('retry-after'));
      if(rateLimitRetries===0&&serverWait!==null&&serverWait>0&&serverWait<=10000){
        await response.body?.cancel().catch(()=>{});
        await sleep(serverWait);
        rateLimitRetries++;
        continue;
      }
      const cooldownMs=serverWait===null?15*60*1000:Math.max(60*1000,serverWait);
      await response.body?.cancel().catch(()=>{});
      throw requestError(`HTTP 429: the site rate-limited this request; retry paused for ${Math.ceil(cooldownMs/60000)} minute(s)`,429,cooldownMs);
    }
    if(response.status===403){
      await response.body?.cancel().catch(()=>{});
      throw requestError('HTTP 403: the site denied automated access; retry paused for 12 hours',403,12*60*60*1000);
    }
    if(response.status>=500&&transientRetries++<1){
      await response.body?.cancel().catch(()=>{});
      await sleep(1500);
      continue;
    }
    if(!response.ok){
      await response.body?.cancel().catch(()=>{});
      throw requestError(`HTTP ${response.status}`,response.status,0);
    }
    return response;
  }
}

export function key(url,sourceId='') {
  let canonical='';
  try{const u=new URL(url),base=u.origin.toLowerCase()+u.pathname.toLowerCase().replace(/\/$/,'');canonical=u.hostname==='www.accenture.com'&&/^\/in-en\/careers\/jobdetails\/?$/i.test(u.pathname)?base+'?id='+(u.searchParams.get('id')||''):base}
  catch{canonical=url.toLowerCase()}
  return sourceId?sourceId+'|'+canonical:canonical;
}

export function appendOffsetUrl(source,offset) {
  const u=new URL(source.url);if(!offset)return u.href;const path=u.pathname.replace(/\/$/,'');return `${u.origin}${path}/${offset}/${u.search}`;
}

export function searchResultsPager(html) {
  const match=strip(html).match(/Results\s+(\d+)\s*(?:[–-]|to)\s+(\d+)\s+of\s+([\d,]+)/i);
  return match?{pageSize:Number(match[2])-Number(match[1])+1,total:Number(match[3].replaceAll(',',''))}:null;
}

export async function fetchText(url) {
  const origin=new URL(url).origin,options={headers:{'user-agent':'JobRadar/1.0 (personal job discovery; respectful public career page fetch)','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-IN,en;q=0.9','referer':origin+'/'}};
  const response=await fetchRespectfully(url,options);
  return response.text();
}

export async function fetchHtmlPage(source,offset,state={},options={}) {
  const buildUrl=options.buildUrl||appendOffsetUrl,url=buildUrl(source,offset,state),html=await fetchText(url);
  let jobs=(options.parse||parseJobs)(html,url,source.name),pageSize=Number(state.pageSize)||0,total=Number(state.total)||0;
  const pager=(options.readPager||searchResultsPager)(html,jobs);
  if(pager){if(pager.pageSize)pageSize=pager.pageSize;if(pager.total)total=pager.total}
  if(!pageSize){pageSize=typeof options.defaultPageSize==='function'?options.defaultPageSize(source,jobs,html):Number(options.defaultPageSize)||0}
  if(options.afterParse)jobs=options.afterParse(jobs,{source,url,html});
  return {jobs,pageSize,total,skipSitemap:!!options.skipSitemap,shortPage:!!options.shortPage,incremental:!!options.incremental};
}