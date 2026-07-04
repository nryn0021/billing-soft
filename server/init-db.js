// Schema is now managed by Drizzle (drizzle-kit) and data by server/seed.js.
// This entrypoint is kept for backwards compatibility with `npm run db:init`,
// which runs `drizzle-kit push` followed by the seed script.
console.log("Run `npm run db:init` to push the schema and seed the default tenant,");
console.log("or `npm run db:push` and `npm run db:seed` individually.");
