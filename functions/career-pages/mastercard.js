import * as workday from './workday.js';

export const id='mastercard';

export function matches(url){
  return url.hostname==='careers.mastercard.com'&&/^\/us\/en\/(?:search-results|search-results\/\d+)\/?$/i.test(url.pathname);
}

function workdaySource(source){
  const pageUrl=new URL(source.url),workdayUrl=new URL('https://mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers');
  const keyword=pageUrl.searchParams.get('keywords')||pageUrl.searchParams.get('q')||'';
  if(keyword)workdayUrl.searchParams.set('q',keyword);
  return {...source,url:workdayUrl.href};
}

function requestedCity(source){
  const pageUrl=new URL(source.url),raw=pageUrl.searchParams.get('location')||pageUrl.searchParams.get('locationsearch')||'';
  return raw.split(',')[0].trim().toLocaleLowerCase();
}

export async function fetchPage(source,offset,state={}){
  // Mastercard's public career experience is powered by Phenom, while its
  // applicant tracking system is Workday. Use the public Workday job feed,
  // which returns structured job cards and direct application URLs.
  const page=await workday.fetchPage(workdaySource(source),offset,state),city=requestedCity(source);
  const jobs=city?page.jobs.filter(job=>(job.location||'').toLocaleLowerCase().includes(city)):page.jobs;
  return {...page,jobs,shortPage:false,skipSitemap:true,incremental:true};
}
