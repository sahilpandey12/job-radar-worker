import { fetchHtmlPage } from './shared.js';

export const id='barclays';
export function matches(url){return url.hostname==='search.jobs.barclays'&&/^\/search-jobs\//i.test(url.pathname)}
function buildUrl(source,offset){
  const url=new URL(source.url),parts=url.pathname.split('/'),last=parts.length;
  if(/^\d+$/.test(parts[last-2]||'')&&/^\d+$/.test(parts[last-1]||'')){const pageSize=Math.max(1,Number(parts[last-2])||50);parts[last-1]=String(Math.floor(offset/pageSize)+1);url.pathname=parts.join('/');}
  return url.href;
}
function defaultPageSize(source){const parts=new URL(source.url).pathname.split('/').filter(Boolean);return Math.max(1,Number(parts.at(-2))||50)}
export function fetchPage(source,offset,state){return fetchHtmlPage(source,offset,state,{buildUrl,defaultPageSize,skipSitemap:true,shortPage:true,incremental:true})}
