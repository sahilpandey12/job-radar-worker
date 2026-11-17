# Job Finder — Vercel + Firebase + GitHub Actions

This is the replacement for the Cloudflare Pages/D1 hosting wrapper. It keeps the current Job Finder screen and career-page adapters, stores jobs in Firebase Firestore, serves the app/API on Vercel, and runs scans in GitHub Actions every two hours (India time). The manual **Run scan** button also starts a GitHub Actions run. **Stop scan** marks the run stopped; the worker stops after its current career-page request finishes.

## What is included

- `index.html` — the current Job Finder UI, updated so the browser no longer performs the scrape loop.
- `api/[...path].js` and `lib/` — Vercel API and Firebase-backed app data.
- `functions/career-pages/` — the career-page adapters from the latest uploaded GitHub ZIP.
- `scripts/scan-worker.js` and `.github/workflows/scan.yml` — scheduled and button-triggered scanner.
- `package.json` — Firebase Admin SDK dependency.

The app creates Firestore collections automatically on its first request. Keep Firestore in production mode; this app uses the server-only Admin SDK, so browser access stays closed.

## Setup steps

### 1. Upload these files to the new GitHub repository

1. Extract this ZIP on your computer.
2. Open `sahilpandey12/job-radar-worker` on GitHub.
3. Choose **Add file → Upload files**.
4. Upload the contents of the extracted `job-radar-vercel-firebase` folder into the repository root. Include the hidden `.github` folder; it contains the scheduled scan workflow.
5. Commit the upload to the `main` branch. The new repository can be public; secrets are configured separately and are not in these files.
6. Open the repository’s **Actions** tab and enable workflows if GitHub asks. GitHub may pause scheduled workflows in public repositories after 60 days without repository activity; check the Actions page occasionally and re-enable the schedule if GitHub pauses it.

Do not upload the ZIP as a single file, and do not upload a Firebase service-account JSON file.

### 2. Add the Firebase key to GitHub Actions

1. In Firebase, open **Project settings → Service accounts → Firebase Admin SDK → Generate new private key**.
2. Store that downloaded JSON key somewhere private. Never commit it to GitHub or send it in chat.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Name the secret `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the full contents of the JSON key as its value.

The Firestore Rules can remain locked in production mode. The service-account key is used only by the Vercel server and GitHub’s private Actions secret store.

### 3. Create a GitHub token for the website’s Run scan button

1. In GitHub, open **Settings → Developer settings → Fine-grained personal access tokens → Generate new token**.
2. Give it access only to `job-radar-worker`.
3. Grant **Actions: Read and write** permission, then create the token.
4. Copy the token once. Add it to Vercel in the next step as `GITHUB_TOKEN`. Do not add it to a project file or GitHub repository contents.

### 4. Import the repository into Vercel

1. In Vercel, choose **Add New → Project**, then import `sahilpandey12/job-radar-worker` from GitHub.
2. Use the repository root. Choose **Other** if Vercel asks for a framework; leave the build command and output directory empty.
3. Before deploying, add these Environment Variables for **Production**:

   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the full Firebase service-account JSON.
   - `APP_PASSWORD` — choose the password used to sign in to Job Finder.
   - `APP_TOKEN` — use a separate long random secret; do not reuse your login password.
   - `GITHUB_TOKEN` — paste the fine-grained token from step 3.
   - `GITHUB_REPOSITORY` — `sahilpandey12/job-radar-worker`
   - `GITHUB_WORKFLOW_FILE` — `scan.yml`
   - `GITHUB_BRANCH` — `main`

4. In the Vercel project’s **Settings → Build and Deployment**, select **Node.js 22.x** if it is not already selected.
5. Deploy. If you add or change an environment variable later, redeploy so the change takes effect.

### 5. Confirm the first scan

1. Open the Vercel deployment URL and sign in with `APP_PASSWORD`.
2. The first visit creates Firestore collections and adds the default career pages from the latest project. They appear in the Career pages list; you can turn pages on or off there.
3. Click **Run scan**. In a separate tab, GitHub **Actions → Job Finder scan** should show the run.
4. Later scans also run on the two-hour schedule in India time. GitHub can delay scheduled runs during busy periods.

## Important notes

- The current Cloudflare deployment and its D1 data are not changed by this package. The new Firestore database starts empty; its first scan fills it. Existing Cloudflare jobs/history are not copied automatically.
- The default sources come from the uploaded project. Accenture starts **OFF** because its feed was failing in the latest setup; it can be turned on in the app if you want to retry. Other pages can still be paused individually.
- If a career site blocks GitHub-hosted requests or changes its public feed, its source status will show that error. This setup does not bypass a site’s access controls.
- Keep the Firebase key and GitHub token out of repository files, screenshots, and chat messages. If either is exposed, revoke and replace it.
