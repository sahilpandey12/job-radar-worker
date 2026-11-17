import * as deloitteIndia from './deloitte-india.js';
import * as deloitteUsi from './deloitte-usi.js';
import * as wipro from './wipro.js';
import * as accenture from './accenture.js';
import * as academian from './academian.js';
import * as ey from './ey.js';
import * as barclays from './barclays.js';
import * as mastercard from './mastercard.js';
import * as northernTrust from './northern-trust.js';
import * as forvisMazars from './forvis-mazars.js';
import * as amber from './amber.js';
import * as cornerstone from './cornerstone.js';
import * as hcltech from './hcltech.js';
import * as cognizant from './cognizant.js';
import * as emerson from './emerson.js';
import * as bny from './bny.js';
import * as tataTechnologies from './tata-technologies.js';
import * as fisGlobal from './fis-global.js';
import * as workday from './workday.js';
import * as generic from './generic.js';

const CAREER_PAGES=[
  deloitteIndia,deloitteUsi,wipro,accenture,academian,ey,barclays,mastercard,
  northernTrust,forvisMazars,amber,cornerstone,hcltech,cognizant,emerson,
  bny,tataTechnologies,fisGlobal,workday,generic
];

export function getCareerPageAdapter(sourceUrl){
  const url=sourceUrl instanceof URL?sourceUrl:new URL(sourceUrl);
  return CAREER_PAGES.find(adapter=>adapter.matches(url))||generic;
}

export async function fetchCareerPage(source,offset,state={}){
  const adapter=getCareerPageAdapter(source.url),result=await adapter.fetchPage(source,offset,state);
  return {...result,adapter:adapter.id};
}

export function normalizeCareerJobUrl(sourceUrl,jobUrl){
  try{
    const adapter=getCareerPageAdapter(sourceUrl);
    return typeof adapter.normalizeJobUrl==='function'?adapter.normalizeJobUrl(jobUrl,sourceUrl):jobUrl;
  }catch{return jobUrl}
}

export { fetchText, key, unescapeHtml } from './shared.js';