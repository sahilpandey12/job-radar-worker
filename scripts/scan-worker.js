import { ensureData } from '../lib/data.js';
import { runScan, runScheduledScan } from '../lib/scanner.js';

const db=await ensureData();
const proxyUrl=String(process.env.CAREER_FETCH_PROXY_URL||'').trim();
const proxyToken=String(process.env.CAREER_FETCH_PROXY_TOKEN||'').trim();
if(!proxyUrl||!proxyToken)throw new Error('Configure CAREER_FETCH_PROXY_URL and CAREER_FETCH_PROXY_TOKEN in GitHub Actions secrets before scanning.');
const gateway=new URL(proxyUrl);
if(gateway.protocol!=='https:')throw new Error('CAREER_FETCH_PROXY_URL must use HTTPS.');

const sourceDocs=await db.collection('sources').get();
const careerHosts=new Set(['accenture.wd103.myworkdayjobs.com']);
for(const doc of sourceDocs.docs){
  try{careerHosts.add(new URL(doc.get('url')).hostname.toLowerCase())}catch{}
}
const rawFetch=globalThis.fetch.bind(globalThis);
const isCareerHost=host=>host===gateway.hostname.toLowerCase()||[...careerHosts].some(base=>host===base||host.endsWith(`.${base}`));
globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init);
  const target=new URL(request.url);
  if(target.protocol!=='https:'||!isCareerHost(target.hostname.toLowerCase()))return rawFetch(input,init);
  const method=request.method.toUpperCase();
  const body=['GET','HEAD'].includes(method)?null:await request.clone().text();
  const headers=Object.fromEntries(request.headers.entries());
  return rawFetch(gateway.href,{
    method:'POST',
    headers:{authorization:`Bearer ${proxyToken}`,'content-type':'application/json'},
    body:JSON.stringify({url:request.url,method,headers,body}),
    signal:request.signal
  });
};
console.log(`Using Cloudflare fetch relay for ${careerHosts.size} career-site hosts.`);

const scanId=String(process.argv[2]||process.env.SCAN_ID||'').trim();
if(scanId){console.log(`Resuming scan ${scanId}`);await runScan(scanId);}
else {const result=await runScheduledScan();console.log(result.skipped?`Scheduled scan skipped; ${result.id} is already running`:`Scheduled scan ${result.id} finished or started`);}
