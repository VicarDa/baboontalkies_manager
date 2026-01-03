# Repository Guidelines

## Project Structure & Module Organization
The MCP server that drives every scrape lives in `src/index.js`, and all CLI entry points (`run-test.js`, `local-scraper.js`, `dashboard-start.js`) sit at the repo root for quick invocation. Diagnostic helpers (`check_*.js`, `verify-timer.sh`, `check_mysql_data.py`) sit beside deployment docs (`DEPLOY.md`, `AUTO_DEPLOY_GUIDE.md`) for one-stop triage. Web UI assets live in `dashboard.html` plus `bootstrap/` and `ssl/`, while logs (`test_run_*.log`) and Excel drops stay at the root for quick review.

## Build, Test, and Development Commands
```bash
npm install              # install dependencies
npm start                # launch MCP scraper server on stdio
npm run dev              # restart src/index.js on file changes
npm run scraper          # execute local-scraper.js for ad-hoc pulls
npm test                 # run run-test.js full-stack scrape
npm run dashboard-dev    # serve dashboard-start.js with watch mode
node check-excel.js      # sanity-check the latest XLSX export
```
Run scripts from the repo root so Playwright caches, SSL paths, and MySQL configs resolve correctly.

## Coding Style & Naming Conventions
The project uses ES modules (`type: module`), 2-space indentation, semicolons, and single quotes unless interpolation is required. Prefer `const`/`let`, `async/await`, and descriptive camelCase identifiers (`scrapeYuekebaoCourses`). Classes remain in PascalCase (e.g., `YuekebaoGrabberServer`). Keep files single-purpose: scraper logic stays inside `src/index.js`, whereas operational helpers follow verb-prefixed filenames like `check_scarlett_schedule.js`.

## Testing Guidelines
`npm test` launches Chromium through Playwright, logs into yuekebao.cn, writes XLSX files, and pushes rows into MySQL—treat it as an integration test and use staging credentials whenever possible. Capture console output inside `test_run_YYYY.log` so regressions can be bisected. Use `node check-excel.js` or `node check-card-excel.js` to validate export schemas, and MySQL probes (`check_mysql_data.py`, `check_scarlett_*.js`) to confirm row counts before deployment.

## Commit & Pull Request Guidelines
Recent history favors concise, descriptive summaries (often Chinese) such as `修复未来周选项点击可见性问题`. Follow the same pattern: one imperative line, optional context after a colon, references to tickets when available. Pull requests should outline what changed, how it was tested (`npm test`, dashboard smoke run, Excel diff), attach sample logs or screenshots, and call out configuration updates or rollback steps.

## Security & Configuration Tips
Database hosts and credentials appear inline within `src/index.js` and the `check_scarlett_*.js` scripts—rotate them via the templates in `AUTO_SCRAPER_CONFIG.md`, and never commit undisclosed passwords. Keep SSL material under `ssl/` with restricted permissions, scrub student PII from Excel exports before sharing, and follow `DEPLOY.md` when copying files to remote hosts so automation hooks keep working.
