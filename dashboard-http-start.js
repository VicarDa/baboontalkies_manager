#!/usr/bin/env node

process.env.HTTPS = 'false';

await import('./dashboard-start.js');
