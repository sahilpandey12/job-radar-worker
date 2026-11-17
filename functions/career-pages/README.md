# Career page adapters

Each adapter in this folder handles one career-site format. The index.js file selects the matching adapter; shared.js contains common HTML and URL helpers.

This complete folder includes the BNY, Tata Technologies, and FIS Global adapters alongside the existing company adapters. Copy the whole folder when replacing this directory so the registry imports remain complete.

The source records are added by lib/data.js on the first API request after deployment. They are written once to Firestore, and later deletion through the app stays permanent.