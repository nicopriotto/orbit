# Contributing

```bash
npm ci
npm run dev        # http://localhost:5192
npm run check      # lint, unit tests and build
npm run test:e2e   # the studio in Chromium, desktop and phone
```

- The end-to-end tests block every call that would bill Muse and fail if one is attempted, so they cost nothing.
- Before generating images, set `MUSE_STOP_AT` and check the spend with `npm run usage`.
- Do not add photos of real people. Sample people are made with Muse Image.
- Commits follow Conventional Commits (`feat(scope): …`, `fix`, `refactor`, `docs`, `chore`), one line each.
