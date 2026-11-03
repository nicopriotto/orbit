# Security

Please report a vulnerability privately through GitHub's "Report a vulnerability" on this repository, not in a public issue.

How the project handles what matters most:

- The Meta Model API key is read on the server only, from `META_API_KEY` or `.env.local`, which git ignores. It never reaches the browser.
- A shopper's photo stays in memory for the length of the request and is never written to disk. Their prints stay in their own browser.
- Every billed endpoint is capped per day and per visitor, and the counts are kept on disk so a restart cannot reset them.
- Every push is scanned for secrets (gitleaks) and analysed with CodeQL.
