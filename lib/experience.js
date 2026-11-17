import { fetchText } from '../functions/career-pages/index.js';
import { unescapeHtml } from '../functions/career-pages/shared.js';

export function cleanText(value='') {
  return unescapeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim());
}
export function detailText(html='') {
  const texts=[];
  const visit=value=>{ if(Array.isArray(value)){value.forEach(visit);return} if(!value||typeof value!=='object')return; const types=Array.isArray(value['@type'])?value['@type']:[value['@type']]; if(types.includes('JobPosting'))texts.push([typeof value.title==='string'?value.title:value.title?.name,value.description,value.qualifications,value.experienceRequirements,value.responsibilities].filter(Boolean).join(' ')); if(value['@graph'])visit(value['@graph']); };
  for(const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(m[1]))}catch{}}
  const rich=cleanText(texts.join(' ')); if(rich.length>=80)return rich.slice(0,24000);
  const main=String(html).match(/<(main|article)\b[^>]*>[\s\S]*?<\/\1>/i); return cleanText((main?.[0]||String(html)).replace(/<(script|style|noscript|nav|header|footer|svg)\b[\s\S]*?<\/\1>/gi,' ')).slice(0,24000);
}
export function blockedReason(text='') {
  const tests=[[/\baccess denied\b/i,'access denied'],[/\bcaptcha\b|\brecaptcha\b/i,'CAPTCHA challenge'],[/\bverify (?:that )?you(?: are|'re) (?:a )?(?:human|person|not a robot)\b/i,'human verification'],[/\bchecking your browser\b|\bjust a moment\b/i,'browser verification'],[/\bunusual traffic\b|\bautomated requests?\b|\bbot detection\b|\bbot protection\b/i,'automated traffic protection'],[/\brequest blocked\b|\btemporarily blocked\b|\bsecurity verification\b/i,'security block'],[/\bcloudflare ray id\b/i,'Cloudflare challenge'],[/\btoo many requests\b/i,'rate limit']];
  return tests.find(([re])=>re.test(text))?.[1]||'';
}
export function fresherEvidence(value='') {
  const t=String(value||'').replace(/\s+/g,' ').trim(); if(!t)return '';
  if(/\b(?:not\s+(?:open|eligible|suitable)\s+for|not\s+accepting)\s+(?:freshers?|entry[ -]level|new graduates?)\b/i.test(t)||/\b(?:freshers?|entry[ -]level|new graduates?)\b[^.!?]{0,80}\b(?:not eligible|not accepted|not considered|not suitable)\b/i.test(t))return '';
  const range=t.match(/\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*(?:years?|yrs?)\b/i); if(range&&Number(range[2])>2)return '';
  if(/\b(?:minimum(?: of)?|at least|requires?|required|must have)\s*(?:of\s*)?([3-9]|[1-9]\d)\s*\+?\s*(?:years?|yrs?)\b|\b([3-9]|[1-9]\d)\s*\+?\s*(?:years?|yrs?)\s*(?:of\s+)?experience\b/i.test(t))return '';
  const re=/\b(?:freshers?|entry[ -]level|(?:0|zero)\s*(?:-|–|—|to)\s*(?:1|2|one|two)\s*(?:years?|yrs?)|1\s*(?:-|–|—|to)\s*2\s*(?:years?|yrs?)|(?:up to|less than|maximum of|no more than)\s*[12]\s*(?:years?|yrs?)|no\s+(?:(?:prior|previous)\s+)?experience|experience\s+(?:is\s+)?(?:not required|not needed|not necessary)|(?:recent|new)\s+graduates?|graduate trainee)\b/i;
  const m=t.match(re); return m?m[0]:'';
}
export async function checkJob(job) {
  const url=new URL(job.url); if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid job posting URL');
  const html=await fetchText(url.href),details=detailText(html),blocked=blockedReason(details); if(blocked)throw new Error(blocked); if(details.length<80)throw new Error('Could not read enough text from this job description');
  return fresherEvidence(`${job.title||''} ${details}`);
}
