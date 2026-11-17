import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ensureData, readJobs, deleteByQuery, DEFAULT_PREFS } from './data.js';
import { getDb } from './firebase.js';
import { activeScan, createScan } from './scanner.js';
import { checkJob } from './experience.js';

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const readBody=async req=>{try{return await req.json()}catch{return {}}};
const tokenFor=(secret,exp)=>`${exp}.${createHmac('sha256',secret).update(String(exp)).digest('base64url')}`;
function authorized(req) {
  const password=process.env.APP_PASSWORD; if(!password)return true;
  const cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('jobradar='))?.slice(9)||'';
  const dot=cookie.indexOf('.'); if(dot<0)return false;
  const exp=Number(cookie.slice(0,dot)); if(!Number.isFinite(exp)||exp<Date.now())return false;
  const expected=tokenFor(process.env.APP_TOKEN||password,exp);
  const a=Buffer.from(cookie),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
function safeWebUrl(value) {
  let u; try{u=new URL(value)}catch{return null;}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;
  const h=u.hostname.toLowerCase();
  if(h==='localhost'||h.endsWith('.localhost')||h==='127.0.0.1'||h==='0.0.0.0'||h==='::1'||/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;
  return u;
}
async function dispatchScan(id) {
  const token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY||'sahilpandey12/job-radar-worker',workflow=process.env.GITHUB_WORKFLOW_FILE||'scan.yml';
  if(!token)throw new Error('Add GITHUB_TOKEN to Vercel before starting a scan');
  const response=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28','user-agent':'Job-Finder'},body:JSON.stringify({ref:process.env.GITHUB_BRANCH||'main',inputs:{scan_id:id}})});
  if(!response.ok){let detail='';try{detail=(await response.json()).message||''}catch{};throw new Error(`GitHub could not start the scan (HTTP ${response.status})${detail?`: ${detail}`:''}`)}
}

export async function handleApi(req) {
  const url=new URL(req.url),path=url.pathname,method=req.method||'GET';
  if((path==='/login'||path==='/api/login')&&method==='POST'){
    const password=process.env.APP_PASSWORD,body=await readBody(req);
    if(!password||body.password!==password)return json({error:'Incorrect password'},401);
    const exp=Date.now()+30*864e5,token=tokenFor(process.env.APP_TOKEN||password,exp);
    return json({ok:true},200,{'set-cookie':`jobradar=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`});
  }
  if(path.startsWith('/api/')&&path!='/api/login'&&!authorized(req))return json({error:'Login required'},401);
  if(!path.startsWith('/api/'))return json({error:'Not found'},404);
  const db=await ensureData();
  if(path==='/api/sync'&&method==='GET'){
    const [sources,count,run]=await Promise.all([db.collection('sources').where('enabled','==',true).get(),db.collection('jobs').count().get(),activeScan(db)]);
    return json({sourceIds:sources.docs.map(d=>d.id).sort(),jobsCount:count.data().count,scanning:!!run,scanId:run?.id||null,scanStatus:run?.message||'',scanProgress:run?[run.status,run.sourceIndex]:null});
  }
  if(path==='/api/state'&&method==='GET'){
    const [sources,jobs,prefs,scans]=await Promise.all([db.collection('sources').get(),readJobs(db,10000),db.collection('preferences').doc('default').get(),db.collection('scans').orderBy('createdAt','desc').limit(20).get()]);
    const src=sources.docs.map(d=>({id:d.id,...d.data()})),statuses=src.length?await db.getAll(...src.map(s=>db.collection('source_scan_status').doc(s.id))):[];
    const byId=new Map(statuses.filter(d=>d.exists).map(d=>[d.id,d.data()])),latest=scans.docs.map(d=>({id:d.id,...d.data()})),run=latest.find(x=>x.status==='scanning')||latest[0]||null,last=latest.find(x=>x.status==='complete')?.finishedAt||null;
    const resultJobs=jobs.filter(j=>src.some(s=>s.id===j.source)).map(j=>({...j,firstSeen:j.firstSeen||'',experienceFit:j.experienceFit??null,experienceEvidence:j.experienceEvidence||'',experienceCheckedAt:j.experienceCheckedAt||'',experienceCheckError:j.experienceCheckError||''}));
    return json({sources:src.map(s=>{const st=byId.get(s.id);return{...s,enabled:s.enabled===true?1:0,scan:st?{scan_id:st.scanId,parsed_count:st.parsedCount||0,inserted_count:st.insertedCount||0,error:st.error||'',last_scanned_at:st.lastScannedAt||''}:null}}),jobs:resultJobs,prefs:prefs.data()?.data||DEFAULT_PREFS,lastScan:last,scanStatus:run?.message||'Run a scan to find new roles',scanning:run?.status==='scanning',authRequired:!!process.env.APP_PASSWORD});
  }
  if(path==='/api/scan'&&method==='POST'){
    if(await activeScan(db))return json({error:'A scan is already running'},409);
    const scan=await createScan(db); if(scan.status!=='scanning')return json({ok:true,scanning:false,message:scan.message});
    try{await dispatchScan(scan.id);return json({ok:true,scanning:true,scanId:scan.id},202)}
    catch(error){await db.collection('scans').doc(scan.id).set({status:'failed',finishedAt:new Date().toISOString(),message:String(error.message||error)},{merge:true});return json({error:String(error.message||error)},502)}
  }
  if(path==='/api/scan/stop'&&method==='POST'){
    const run=await activeScan(db);if(!run)return json({ok:true,scanning:false});
    await db.collection('scans').doc(run.id).set({status:'stopped',finishedAt:new Date().toISOString(),message:'Stopped by user'},{merge:true});return json({ok:true,scanning:false});
  }
  if(path==='/api/scan/step'&&method==='POST'){
    const run=await activeScan(db);return json({ok:true,scanning:!!run,message:run?.message||''});
  }
  if(path==='/api/sources'&&method==='POST'){
    if(await activeScan(db))return json({error:'Stop the current scan before adding a career page'},409);
    const body=await readBody(req),u=safeWebUrl(body.url);if(!u)return json({error:'Enter a valid public career page URL'},400);
    const id=randomUUID(),name=String(body.name||u.hostname).trim().slice(0,100);await db.collection('sources').doc(id).set({id,name,url:u.href,enabled:true,createdAt:new Date().toISOString()});return json({id,name,url:u.href,enabled:1},201);
  }
  if(path==='/api/sources/all'&&method==='POST'){
    if(await activeScan(db))return json({error:'Stop the current scan before selecting all pages'},409);
    const sources=await db.collection('sources').get();for(let i=0;i<sources.docs.length;i+=400){const b=db.batch();sources.docs.slice(i,i+400).forEach(d=>b.update(d.ref,{enabled:true}));await b.commit();}return json({ok:true});
  }
  const sourceMatch=path.match(/^\/api\/sources\/([^/]+)$/);
  if(sourceMatch&&method==='PATCH'){
    const id=decodeURIComponent(sourceMatch[1]),body=await readBody(req),enabled=Number(body.enabled);if(enabled!==0&&enabled!==1)return json({error:'Source state must be on or off'},400);
    const ref=db.collection('sources').doc(id),snap=await ref.get();if(!snap.exists)return json({error:'Career page not found'},404);await ref.update({enabled:enabled===1});return json({ok:true,id,enabled});
  }
  if(sourceMatch&&method==='DELETE'){
    if(await activeScan(db))return json({error:'Stop the current scan before removing a career page'},409);
    const id=decodeURIComponent(sourceMatch[1]);await deleteByQuery(db,'jobs','source',id);await db.collection('source_scan_status').doc(id).delete();await db.collection('sources').doc(id).delete();return json({ok:true});
  }
  if(path==='/api/preferences'&&method==='POST'){
    const body=await readBody(req),prefs={titles:String(body.titles||''),locations:String(body.locations||''),experience:String(body.experience||''),days:Math.max(1,Math.min(365,Number(body.days)||30))};await db.collection('preferences').doc('default').set({data:prefs,updatedAt:new Date().toISOString()},{merge:true});return json(prefs);
  }
  if(path==='/api/experience-check'&&method==='POST'){
    const body=await readBody(req),ids=[...new Set((Array.isArray(body.ids)?body.ids:[]).map(x=>String(x||'').slice(0,120)).filter(Boolean))].slice(0,4);
    const checked=await Promise.all(ids.map(async id=>{
      const ref=db.collection('jobs').doc(id),snap=await ref.get();if(!snap.exists)return{id,error:'Job no longer exists'};const job={id:snap.id,...snap.data()};
      if(job.experienceCheckedAt)return{id,experienceFit:job.experienceFit,experienceEvidence:job.experienceEvidence||'',experienceCheckedAt:job.experienceCheckedAt,experienceCheckError:''};
      try{const evidence=await checkJob(job),checkedAt=new Date().toISOString();await ref.update({experienceFit:evidence?1:0,experienceEvidence:evidence,experienceCheckedAt:checkedAt,experienceCheckError:''});return{id,experienceFit:evidence?1:0,experienceEvidence:evidence,experienceCheckedAt:checkedAt,experienceCheckError:''}}
      catch(error){const message=String(error?.message||error).slice(0,220);await ref.update({experienceCheckError:message});return{id,experienceFit:null,experienceEvidence:'',experienceCheckedAt:'',experienceCheckError:message}}
    }));return json({jobs:checked});
  }
  if(path==='/api/jobs'&&method==='DELETE'){
    const body=await readBody(req),id=String(body.id||'');if(!id)return json({error:'Job id is required'},400);await db.collection('jobs').doc(id).delete();return json({ok:true});
  }
  return json({error:'Not found'},404);
}
