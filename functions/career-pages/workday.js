import { abs, fetchRespectfully, strip } from './shared.js';

export const id='workday';
export function matches(url){return url.hostname.endsWith('.myworkdayjobs.com')&&/^\/[^/]+\/[^/]+\/?$/i.test(url.pathname)}
export async function fetchPage(source,offset){
  const sourceUrl=new URL(source.url),parts=sourceUrl.pathname.split('/').filter(Boolean),locale=parts[0]||'en-US',site=parts[1]||'',tenant=sourceUrl.hostname.split('.')[0],limit=20,apiUrl=new URL(`/wday/cxs/${tenant}/${site}/jobs`,sourceUrl.origin),appliedFacets={};
  for(const [facet,value] of sourceUrl.searchParams.entries())if(value&&facet!=='q'&&facet!=='source')(appliedFacets[facet]??=[]).push(value);
  const response=await fetchRespectfully(apiUrl.href,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'JobRadar/1.0 (personal job discovery; respectful public career page fetch)'},body:JSON.stringify({appliedFacets,limit,offset,searchText:sourceUrl.searchParams.get('q')||''})});
  if(!response.ok)throw Error(`Workday job feed HTTP ${response.status}`);
  const data=await response.json(),records=Array.isArray(data.jobPostings)?data.jobPostings:[],base=`${sourceUrl.origin}/${locale}/${site}/`;
  const jobs=records.map(item=>{const title=strip(item.title||item.postingTitle||''),url=abs(item.externalPath||item.url||'',base),rawLocation=item.locationsText||item.location||item.primaryLocation||'',location=strip(typeof rawLocation==='string'?rawLocation:Array.isArray(rawLocation)?rawLocation.join(', '):JSON.stringify(rawLocation));return title&&url?{company:source.name,title,location:location||'',posted:String(item.postedOn||item.postingDate||''),url,description:strip(item.jobDescription||item.description||'')}:null}).filter(Boolean);
  return {jobs,total:Number(data.total)||0,pageSize:limit,skipSitemap:true,shortPage:true,incremental:true};
}
