import { fetchHtmlPage, key, strip } from './shared.js';

export const id='deloitte-usi';
export function matches(url){return url.hostname==='usijobs.deloitte.com'&&/^\/en_US\/careersUSI\/SearchJobs\//i.test(url.pathname)}
function buildUrl(source,offset){const url=new URL(source.url);url.searchParams.set('jobOffset',String(offset));return url.href}
function parseDeloitteUSI(html,base,company){
  const jobs=[],seen=new Set(),locationPattern=/\b(Pune|Remote|Bengaluru|Bangalore|Hyderabad|Mumbai|Delhi|Gurugram|Gurgaon|Noida|Chennai|Kolkata|Ahmedabad|Jaipur|Indore|Kochi|Coimbatore|Nagpur)(?:,\s*(?:IN|India|Maharashtra|Karnataka|Telangana))?\b/i;
  const locations=[...new Set([...strip(html).matchAll(new RegExp(locationPattern.source,'gi'))].map(m=>m[0]).filter(Boolean))],pageLocation=locations.length===1?locations[0]:'';
  const add=(href,tag='',inner='',index=0)=>{
    let url='';try{url=new URL(href,base).href}catch{}if(!url||!/\/careersUSI\/JobDetail\//i.test(new URL(url).pathname))return;
    const parts=new URL(url).pathname.split('/').filter(Boolean),detail=parts.findIndex(x=>/^JobDetail$/i.test(x));let slug=parts[detail+1]||parts.at(-1)||'';if(/^\d+$/.test(slug))slug=parts[detail+2]||'';
    const attr=tag.match(/\b(?:data-job-title|data-title|aria-label|title)\s*=\s*(["'])(.*?)\1/i);try{slug=decodeURIComponent(slug)}catch{}
    let title=strip(attr?.[2]||inner);if(!title||/^(?:view|apply|job details?|learn more|read more)$/i.test(title))title=slug.replace(/^USI[-_\s]+EH\d+[-_\s]*/i,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
    const context=html.slice(Math.max(0,index-900),Math.min(html.length,index+1400)),plain=strip(context),loc=plain.match(locationPattern),date=plain.match(/(?:Posted|Posting Start Date|Date Posted)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w{3,9}\s+\d{1,2},?\s+\d{4})/i),id=key(url);
    if(!title||seen.has(id))return;seen.add(id);jobs.push({company,title,location:loc?.[0]||pageLocation,posted:date?.[1]||'',url,description:''});
  };
  for(const match of html.matchAll(/<a\b[^>]*>/gi)){const tag=match[0],href=tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];if(!href||!/\/careersUSI\/JobDetail\//i.test(href))continue;const start=match.index+match[0].length,end=html.indexOf('</a>',start),inner=end>=0?html.slice(start,end):'';add(href,tag,inner,match.index)}
  for(const match of html.matchAll(/(?:https?:\/\/[^"'<>\s\\]+)?\/(?:en_US\/)?careersUSI\/JobDetail\/[^"'<>\s\\]+/gi))add(match[0],'','',match.index);
  return jobs;
}
function pageSize(source){return Math.max(1,Math.min(100,Number(new URL(source.url).searchParams.get('jobRecordsPerPage'))||10))}
function trustPuneSearchFilter(jobs){
  return jobs.map(job=>({...job,location:/\bpune\b/i.test(job.location)?job.location:[job.location,'Pune (career page filter)'].filter(Boolean).join(' · '),locationVerified:true}));
}
export function fetchPage(source,offset,state){return fetchHtmlPage(source,offset,state,{buildUrl,parse:parseDeloitteUSI,defaultPageSize:pageSize,skipSitemap:true,shortPage:true,incremental:true,afterParse:trustPuneSearchFilter})}
