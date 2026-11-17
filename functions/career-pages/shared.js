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

export async function fetchText(url) {
  const origin=new URL(url).origin,options={headers:{'user-agent':'JobRadar/1.0 (personal job discovery; respectful public career page fetch)','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-IN,en;q=0.9','referer':origin+'/'}};
  for(let attempt=0;attempt<2;attempt++){
    try{const r=await fetch(url,options);if(r.ok)return r.text();if(attempt===0&&[521,522,523,524,502,503,504].includes(r.status)){await new Promise(resolve=>setTimeout(resolve,700));continue}throw Error(`HTTP ${r.status}`)}
    catch(e){if(attempt===0&&/fetch failed|network|connection/i.test(String(e))){await new Promise(resolve=>setTimeout(resolve,700));continue}throw e}
  }
  throw Error('Career page temporarily unavailable after retry');
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

export async function fetchHtmlPage(source,offset,state={},options={}) {
  const buildUrl=options.buildUrl||appendOffsetUrl,url=buildUrl(source,offset,state),html=await fetchText(url);
  let jobs=(options.parse||parseJobs)(html,url,source.name),pageSize=Number(state.pageSize)||0,total=Number(state.total)||0;
  const pager=(options.readPager||searchResultsPager)(html,jobs);
  if(pager){if(pager.pageSize)pageSize=pager.pageSize;if(pager.total)total=pager.total}
  if(!pageSize){pageSize=typeof options.defaultPageSize==='function'?options.defaultPageSize(source,jobs,html):Number(options.defaultPageSize)||0}
  if(options.afterParse)jobs=options.afterParse(jobs,{source,url,html});
  return {jobs,pageSize,total,skipSitemap:!!options.skipSitemap,shortPage:!!options.shortPage,incremental:!!options.incremental};
}
