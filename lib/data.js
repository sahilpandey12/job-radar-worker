import { getDb } from './firebase.js';
import { createHash } from 'node:crypto';

export const DEFAULT_PREFS = { titles: 'Data Analyst, Business Analyst, Analyst', locations: 'Pune, Remote', experience: 'fresher, entry level, 0-2 years', days: 30 };
export const DEFAULT_SOURCES = [
  {id:'deloitte-india',name:'Deloitte India',url:'https://southasiacareers.deloitte.com/search/?createNewAlert=false&q=Analyst&locationsearch=Pune&optionsFacetsDD_city=&optionsFacetsDD_customfield2='},
  {id:'deloitte-usi-analyst',name:'Deloitte USI Analyst',url:'https://usijobs.deloitte.com/en_US/careersUSI/SearchJobs/Analyst?10567=%5B2369418%5D&10567_format=10033&10568=%5B11267698%5D&10568_format=10034&listFilterMode=1&jobSort=relevancy&jobRecordsPerPage=10&'},
  {id:'ey-analyst-pune',name:'EY Pune Analyst',url:'https://careers.ey.com/ey/search/?q=Analyst+Pune&q2=&alertId=&title=Analyst&location=Pune#searchresults'},
  {id:'barclays-pune-analyst',name:'Barclays Pune Analyst',url:'https://search.jobs.barclays/search-jobs/Analyst/Pune%2C%20Maharashtra/13015/1/4/1269750-1264418-8133375-1259229/18x51957/73x85535/50/2'},
  {id:'mastercard-pune-analyst',name:'Mastercard Pune Analyst',url:'https://careers.mastercard.com/us/en/search-results?keywords=Analyst&p=ChIJARFGZy6_wjsRQ-Oenb9DjYI&location=Pune%2C%20Maharashtra%2C%20India'},
  {id:'northerntrust-pune-analyst',name:'Northern Trust Pune Analyst',url:'https://ntrs.wd1.myworkdayjobs.com/en-GB/northerntrust/?q=Analyst&source=APPLICANT_SOURCE-3-356&locationCountry=c4f78be1a8f14da0ab49ce1162348a5e&locationRegionStateProvince=a3c37012f51642f4a7b3dafc8ac37801&locations=333f5ad2433c1000f78f820bceb80000'},
  {id:'academian',name:'Academian',url:'https://academian.com/careers/'},
  {id:'accenture',name:'Accenture Pune',url:'https://www.accenture.com/in-en/careers/jobsearch?ct=Pune&jt=Experience%3A%200-2%20years'},
  {id:'forvis-mazars',name:'Forvis Mazars',url:'https://careers-asia.forvismazars.com/india/?contract-type=full-time&location=pune-delivery-platform-india'},
  {id:'amber',name:'Amber',url:'https://amberstudent.com/job-opening'},
  {id:'cornerstone',name:'Cornerstone Pune Analyst',url:'https://cornerstone.csod.com/ux/ats/careersite/2/home?c=cornerstone&sq=Analyst&lq=Pune%2C%20Maharashtra%2C%20India&pl=ChIJARFGZy6_wjsRQ-Oenb9DjYI'},
  {id:'wipro',name:'Wipro-Pune',url:'https://careers.wipro.com/search/?q=Analyst&locationsearch=Pune&searchResultView=LIST&markerViewed=&carouselIndex=&facetFilters=%7B%22jobLocationCountry%22%3A%5B%22India%22%5D%2C%22jobLocationState%22%3A%5B%22Maharashtra%22%5D%2C%22sfstd_jobLocation_obj%22%3A%5B%22Pune%22%5D%7D&pageNumber=0'},
  {id:'hcltech',name:'HCL Tech Pune',url:'https://careers.hcltech.com/search/?q=Pune&locationsearch=&searchResultView=LIST&pageNumber=0&facetFilters=%7B%7D&sortBy=&markerViewed=&carouselIndex='},
  {id:'cognizant-pune-analyst',name:'Cognizant Pune Analyst',url:'https://careers.cognizant.com/india-en/jobs/?keyword=Analyst&location=Pune%2C%20Maharashtra%2C%20India&lat=18.5246091&lng=73.8786239&cname=India&ccode=IN&origin=global'},
  {id:'emerson-pune-analyst',name:'Emerson Pune Analyst',url:'https://hdjq.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs?keyword=Analyst&lastSelectedFacet=LOCATIONS&location=PUNE%2C+MAHARASHTRA%2C+India&locationId=300000029960390&locationLevel=city&mode=location&radius=25&radiusUnit=MI&selectedLocationsFacet=300000029960390'}
  {id:'bny-pune',name:'BNY Pune',url:'https://eofe.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/BNY-Careers/jobs?lastSelectedFacet=LOCATIONS&location=Pune%2C+MH%2C+India&locationId=300000028474391&locationLevel=city&mode=location&radius=25&radiusUnit=MI&selectedLocationsFacet=300000028474391'},
  {id:'tata-technologies-pune',name:'Tata Technologies Pune',url:'https://tatatechnologies.ripplehire.com/candidate/?token=jjZIWXgr7fPCCF6T5yk4&source=CAREERSITE#list/location=PUNE&exp=1'},
  {id:'fis-global-pune',name:'FIS Global Pune',url:'https://careers.fisglobal.com/us/en/search-results?keywords=Pune'}
];

export function jobId(url, sourceId) {
  let canonical = String(url || '').trim().toLowerCase();
  try {
    const u = new URL(url);
    canonical = u.hostname.toLowerCase() === 'www.accenture.com' && /\/in-en\/careers\/jobdetails\/?/i.test(u.pathname)
      ? `${u.origin}${u.pathname}?id=${u.searchParams.get('id') || ''}` : `${u.origin}${u.pathname}`;
  } catch {}
  return createHash('sha256').update(`${sourceId}|${canonical}`).digest('hex');
}

const ADDED_CAREER_PAGE_SOURCES = [
  {id:'bny-pune',name:'BNY Pune',url:'https://eofe.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/BNY-Careers/jobs?lastSelectedFacet=LOCATIONS&location=Pune%2C+MH%2C+India&locationId=300000028474391&locationLevel=city&mode=location&radius=25&radiusUnit=MI&selectedLocationsFacet=300000028474391'},
  {id:'tata-technologies-pune',name:'Tata Technologies Pune',url:'https://tatatechnologies.ripplehire.com/candidate/?token=jjZIWXgr7fPCCF6T5yk4&source=CAREERSITE#list/location=PUNE&exp=1'},
  {id:'fis-global-pune',name:'FIS Global Pune',url:'https://careers.fisglobal.com/us/en/search-results?keywords=Pune'}
];

function sourceHostname(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

async function seedAddedCareerPages(db) {
  const markerRef = db.collection('settings').doc('career-pages-bny-tata-fis-v1');
  const sourcesRef = db.collection('sources');
  const createdAt = new Date().toISOString();

  await db.runTransaction(async transaction => {
    const marker = await transaction.get(markerRef);
    if (marker.exists) return;

    const snapshot = await transaction.get(sourcesRef);
    const existingHosts = new Set(snapshot.docs.map(doc => sourceHostname(doc.data().url)).filter(Boolean));
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));

    for (const source of ADDED_CAREER_PAGE_SOURCES) {
      if (existingHosts.has(sourceHostname(source.url)) || existingIds.has(source.id)) continue;
      transaction.create(sourcesRef.doc(source.id), { ...source, enabled: true, createdAt });
    }

    transaction.create(markerRef, {
      version: 1,
      completedAt: createdAt,
      sourceIds: ADDED_CAREER_PAGE_SOURCES.map(source => source.id)
    });
  });
}
export async function ensureData() {
  const db = getDb(), metaRef = db.collection('settings').doc('bootstrap');
  const meta = await metaRef.get();
  if (!meta.exists) {
    const batch = db.batch();
    for (const s of DEFAULT_SOURCES) batch.set(db.collection('sources').doc(s.id), { ...s, enabled: s.id !== 'accenture', createdAt: new Date().toISOString() }, { merge: true });
    batch.set(db.collection('preferences').doc('default'), { data: DEFAULT_PREFS }, { merge: true });
    batch.set(metaRef, { done: true, completedAt: new Date().toISOString() });
    await batch.commit();
  }
  const prefsRef = db.collection('preferences').doc('default');
  if (!(await prefsRef.get()).exists) await prefsRef.set({ data: DEFAULT_PREFS });
  await seedAddedCareerPages(db);
  return db;
}

export async function readJobs(db, limit = 10000) {
  const rows = await db.collection('jobs').orderBy('firstSeen', 'desc').limit(limit).get();
  return rows.docs.map(d => { const { description, ...job } = d.data(); return { id: d.id, ...job }; });
}

export async function deleteByQuery(db, collection, field, value) {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(collection).where(field, '==', value).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch(); snap.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return deleted;
}

