import { fetchHtmlPage } from './shared.js';

export const id='deloitte-india';
export function matches(url){return url.hostname==='southasiacareers.deloitte.com'&&/^\/search\/?$/i.test(url.pathname)}
function buildUrl(source,offset){const url=new URL(source.url);if(offset)url.searchParams.set('startrow',String(offset));else url.searchParams.delete('startrow');return url.href}
export function fetchPage(source,offset,state){return fetchHtmlPage(source,offset,state,{buildUrl,incremental:true})}
