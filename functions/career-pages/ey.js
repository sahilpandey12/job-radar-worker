import { fetchHtmlPage } from './shared.js';

export const id='ey';
export function matches(url){return url.hostname==='careers.ey.com'&&/^\/ey\/search\/?$/i.test(url.pathname)}
function buildUrl(source,offset){const url=new URL(source.url);url.searchParams.set('startrow',String(offset));url.searchParams.set('sortColumn','referencedate');url.searchParams.set('sortDirection','desc');return url.href}
export function fetchPage(source,offset,state){return fetchHtmlPage(source,offset,state,{buildUrl,defaultPageSize:(_,jobs)=>jobs.length||10,skipSitemap:true,shortPage:true,incremental:true})}
