import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let cached;
export function getDb() {
  if (cached) return cached;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  let account;
  try { account = JSON.parse(raw); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain the full service-account JSON'); }
  const app = getApps()[0] || initializeApp({ credential: cert(account), projectId: account.project_id });
  cached = getFirestore(app);
  return cached;
}
