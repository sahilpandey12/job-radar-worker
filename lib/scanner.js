import { randomUUID } from 'node:crypto';
import { fetchCareerPage, fetchText, key, unescapeHtml } from '../functions/career-pages/index.js';
import { getDb } from './firebase.js';
import { jobId } from './data.js';

const now = () => new Date().toISOString();
const scanCol = db => db.collection('scans');
export async function activeScan(db=getDb()) {
  const snap=await scanCol(db).where('status','==','scanning').limit(1).get();
  return snap.empty?null:{id:snap.docs[0].id,...snap.docs[0].data()};
}
export async function createScan(db=getDb()) {
  const old=await activeScan(db); if(old)return old;
  const sources=await db.collection('sources').where('enabled','==',true).get();
  const id=randomUUID(),sourceIds=sources.docs.map(d=>d.id);
  const ref=scanCol(db).doc(id);
  await ref.create({status:sourceIds.length?'scanning':'complete',sourceIds,sourceIndex:0,nextOffset:0,pageSize:0,total:0,newCount:0,message:sourceIds.length?'Starting scan':'No career pages are enabled',createdAt:now(),finishedAt:sourceIds.length?'':now()});
  return {id,sourceIds,status:sourceIds.length?'scanning':'complete',sourceIndex:0,nextOffset:0,pageSize:0,total:0,newCount:0,message:sourceIds.length?'Starting scan':'No career pages are enabled'};
}

async function recordStatus(db,sourceId,scanId,parsed,inserted,error='',details={}) {
  const ref=db.collection('source_scan_status').doc(sourceId),snap=await ref.get(),old=snap.data()||{};
  const same=old.scanId===scanId;
  await ref.set({sourceId,scanId,lastScannedAt:now(),parsedCount:(same?Number(old.parsedCount)||0:0)+parsed,insertedCount:(same?Number(old.insertedCount)||0:0)+inserted,error:String(error||''),...details},{merge:true});
}

async function sitemapJobs(source,offset,pageSize) {
  for(const path of ['/sitemap.xml','/sitemap_index.xml']) {
    try {
      let xml=await fetchText(new URL(path,source.url).href),urls=[...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m=>unescapeHtml(m[1].trim()));
      if(!urls.some(x=>/(\/job\/|jobdetail|job-details|jobposting)/i.test(x))) {
        for(const child of urls.slice(0,3)){if(!/sitemap/i.test(child))continue;try{xml+=' '+await fetchText(child)}catch{}}
        urls=[...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m=>unescapeHtml(m[1].trim()));
      }
      const jobUrls=urls.filter(x=>/(\/job\/|jobdetail|job-details|jobposting)/i.test(x));
      if(jobUrls.length) {
        const size=pageSize||50;
        return {jobs:jobUrls.slice(offset,offset+size).map(link=>{const u=new URL(link),parts=u.pathname.split('/').filter(Boolean),at=parts.findIndex(x=>/^job$/i.test(x)),slug=at>=0?parts[at+1]:parts.at(-1);return{company:source.name,title:decodeURIComponent(slug||'').replace(/[-_]+/g,' ').replace(/\s+\d.*$/,''),location:'',posted:'',url:link,description:''}}),pageSize:size,total:jobUrls.length,shortPage:false,incremental:false};
      }
    } catch {}
  }
  return null;
}

async function persistJobs(db,source,scanId,jobs) {
  let inserted=0;
  for(let start=0;start<jobs.length;start+=350) {
    const chunk=jobs.slice(start,start+350).filter(j=>j?.url&&j?.title);
    if(!chunk.length)continue;
    const refs=chunk.map(j=>db.collection('jobs').doc(jobId(j.url,source.id)));
    const existing=await db.getAll(...refs),batch=db.batch(),stamp=now();
    chunk.forEach((j,i)=>{
      const old=existing[i].exists?existing[i].data():null;
      const record={company:String(j.company||source.name).slice(0,240),title:String(j.title||'').slice(0,600),location:String(j.location||old?.location||'').slice(0,500),posted:String(j.posted||old?.posted||'').slice(0,80),url:String(j.url).slice(0,3000),description:String(j.description||old?.description||'').slice(0,50000),source:source.id,firstSeen:old?.firstSeen||stamp,addedScanId:old?.addedScanId||scanId,experienceFit:old?.experienceFit??null,experienceEvidence:old?.experienceEvidence||'',experienceCheckedAt:old?.experienceCheckedAt||'',experienceCheckError:old?.experienceCheckError||''};
      batch.set(refs[i],record);
      if(!old)inserted++;
    });
    await batch.commit();
  }
  return inserted;
}

async function advance(db,ref,patch) { await ref.set({...patch,updatedAt:now()},{merge:true}); }
export async function runScan(scanId) {
  const db=getDb(),ref=scanCol(db).doc(scanId);
  while(true) {
    const snap=await ref.get(); if(!snap.exists)return;
    const run=snap.data(); if(run.status!=='scanning')return;
    const ids=Array.isArray(run.sourceIds)?run.sourceIds:[];
    if(run.sourceIndex>=ids.length){await advance(db,ref,{status:'complete',finishedAt:now(),message:`${Number(run.newCount)||0} new jobs found`});return;}
    const sourceSnap=await db.collection('sources').doc(ids[run.sourceIndex]).get();
    if(!sourceSnap.exists||sourceSnap.get('enabled')!==true){await advance(db,ref,{sourceIndex:run.sourceIndex+1,nextOffset:0,pageSize:0,total:0,message:'Skipped paused or removed career page'});continue;}
    const source={id:sourceSnap.id,...sourceSnap.data()},offset=Number(run.nextOffset)||0;
    const statusSnap=await db.collection('source_scan_status').doc(source.id).get();
    const cooldownUntil=String(statusSnap.get('cooldownUntil')||'');
    if(cooldownUntil&&Date.parse(cooldownUntil)>Date.now()){
      await advance(db,ref,{sourceIndex:run.sourceIndex+1,nextOffset:0,pageSize:0,total:0,message:`${source.name}: site rate-limit cooldown active until ${cooldownUntil}`});
      continue;
    }
    try {
      let page=await fetchCareerPage(source,offset,{pageSize:Number(run.pageSize)||0,total:Number(run.total)||0});
      if(!page.jobs.length&&!page.skipSitemap){const fallback=await sitemapJobs(source,offset,page.pageSize);if(fallback)page={...page,...fallback};}
      const added=await persistJobs(db,source,scanId,page.jobs||[]);
      await recordStatus(db,source.id,scanId,(page.jobs||[]).length,added,'',{cooldownUntil:''});
      const pageSize=Number(page.pageSize)||0,total=Number(page.total)||0,next=pageSize?offset+pageSize:0;
      const shortPage=!!page.shortPage&&pageSize>0&&(page.jobs||[]).length<pageSize;
      const reachedSavedJobs=!!page.incremental&&(page.jobs||[]).length>0&&added===0;
      const done=!pageSize||shortPage||(total>0&&next>=total)||reachedSavedJobs;
      const message=`${source.name}: scanned ${pageSize?Math.min(next,total||next):(page.jobs||[]).length}${total?` of ${total}`:' listings'}; ${added} new`;
      await advance(db,ref,{sourceIndex:run.sourceIndex+(done?1:0),nextOffset:done?0:next,pageSize:done?0:pageSize,total:done?0:total,newCount:(Number(run.newCount)||0)+added,message});
    } catch(error) {
      const rateLimited=Number(error?.status)===429||/HTTP 429/.test(String(error?.message||error));
      const cooldownMs=rateLimited?Math.max(60_000,Number(error?.retryAfterMs)||15*60*1000):0;
      const cooldownUntil=rateLimited?new Date(Date.now()+cooldownMs).toISOString():'';
      const detail=rateLimited?`HTTP 429; retry paused until ${cooldownUntil}`:String(error?.message||error).slice(0,300);
      const message=`${source.name}: ${detail}`;
      await recordStatus(db,source.id,scanId,0,0,message,rateLimited?{cooldownUntil}:{});
      await advance(db,ref,{sourceIndex:run.sourceIndex+1,nextOffset:0,pageSize:0,total:0,message});
    }
  }
}

export async function runScheduledScan() {
  const db=getDb(),current=await activeScan(db);
  if(current) {
    const age=Date.now()-Date.parse(current.createdAt||now());
    if(age<6*60*60*1000)return {skipped:true,id:current.id};
    await scanCol(db).doc(current.id).set({status:'failed',finishedAt:now(),message:'Scan expired; a new scheduled scan can start'},{merge:true});
  }
  const scan=await createScan(db); if(scan.status==='scanning')await runScan(scan.id); return scan;
}
