import { fetchHtmlPage } from './shared.js';

export const id='generic';
export function matches(){return true}
export function fetchPage(source,offset,state){return fetchHtmlPage(source,offset,state,{skipSitemap:false,shortPage:false,incremental:true})}
