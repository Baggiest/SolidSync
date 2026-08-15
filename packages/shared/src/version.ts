// Single source of truth for the product version. The CLI, the /api/health
// endpoint and (via `npm run bump`) the package.json files all read this.
export const VERSION = '0.4.5'
