# Career page integrations

Each employer adapter owns how its career page is queried, paginated, and parsed. The index.js file is the registry. The shared.js file contains common fetching, URL, and HTML parsing helpers.

## Adapter contract

Each adapter exports an id, a matches(url) function, and a fetchPage(source, offset, state) function returning { jobs, pageSize, total }. A job contains its title, location, posting date, official application URL, and description.

## Current adapters

- deloitte-india.js
- deloitte-usi.js
- wipro.js
- accenture.js
- academian.js
- ey.js
- barclays.js
- mastercard.js
- northern-trust.js
- forvis-mazars.js
- amber.js
- cornerstone.js
- hcltech.js
- cognizant.js
- emerson.js
- bny.js — Oracle Candidate Experience job feed, retaining the selected location facet from the supplied URL
- tata-technologies.js — RippleHire public HTML/embedded-data reader; reports an actionable error if the page returns only its client-side shell
- fis-global.js — FIS/Phenom search results and offset pagination
- workday.js
- generic.js

## Add another career page

Send the career-page search URL in chat. I will inspect its public listings, add a company-specific adapter file, connect it to the registry, and return a replacement ZIP. Extract the ZIP into the repository root and upload the included replacements to GitHub.

The website's Career pages form saves a URL; it does not generate server-side scraper code by itself. After deploying new adapters, add each new source once in the app's Career pages form if it is not already saved. This keeps your existing source records intact.