import * as workday from './workday.js';

export const id='northern-trust';
export function matches(url){return url.hostname==='ntrs.wd1.myworkdayjobs.com'&&workday.matches(url)}

export function normalizeJobUrl(jobUrl,sourceUrl){
  try{
    const pageUrl=sourceUrl instanceof URL?sourceUrl:new URL(sourceUrl);
    const parts=pageUrl.pathname.split('/').filter(Boolean),locale=parts[0]||'en-GB',site=parts[1]||'northerntrust';
    const parsed=new URL(jobUrl,pageUrl.origin),path=parsed.pathname,jobIndex=path.toLowerCase().indexOf('/job/');
    if(jobIndex<0)return parsed.href;
    return new URL(`/${locale}/${site}${path.slice(jobIndex)}`,pageUrl.origin).href;
  }catch{return jobUrl}
}

export async function fetchPage(source,offset,state){
  const result=await workday.fetchPage(source,offset,state);
  return {...result,jobs:result.jobs.map(job=>({...job,url:normalizeJobUrl(job.url,source.url)}))};
}
