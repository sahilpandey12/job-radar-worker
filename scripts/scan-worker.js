import { ensureData } from '../lib/data.js';
import { runScan, runScheduledScan } from '../lib/scanner.js';

await ensureData();
const scanId=String(process.argv[2]||process.env.SCAN_ID||'').trim();
if(scanId){console.log(`Resuming scan ${scanId}`);await runScan(scanId);}
else {const result=await runScheduledScan();console.log(result.skipped?`Scheduled scan skipped; ${result.id} is already running`:`Scheduled scan ${result.id} finished or started`);}
