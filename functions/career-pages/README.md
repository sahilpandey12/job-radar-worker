# Career page integrations

Each employer adapter owns how its career page is queried, paginated, and parsed. `index.js` is the registry. `shared.js` contains common fetching, URL, and HTML parsing helpers.

## Adapter contract

Each adapter exports an `id`, a `matches(url)` function, and a `fetchPage(source, offset, state)` function returning `{ jobs, pageSize, total }`. A job contains its title, location, posting date, official application URL, and description.

## Current adapters

- `deloitte-india.js`
- `deloitte-usi.js`
- `wipro.js`
- `accenture.js`
- `academian.js`
- `ey.js`
- `barclays.js`
- `mastercard.js`
- `northern-trust.js`
- `forvis-mazars.js`
- `amber.js`
- `cornerstone.js`
- `hcltech.js`
- `cognizant.js` — Cognizant search results and pagination
- `emerson.js` — Emerson Oracle Candidate Experience public job feed
- `workday.js` — shared Workday jobs feed
- `generic.js` — fallback for sources without a dedicated adapter

## Add another career page

Send the career-page search URL in chat. I will inspect its public listings, add a company-specific adapter file, connect it to the registry, and return a replacement ZIP. Extract the ZIP into the repository root and upload the included replacements to GitHub.

Each new adapter is kept in its own file so a company-specific query, pagination, or location change stays isolated. The website's Career pages form saves a URL; it does not generate server-side scraper code by itself.
