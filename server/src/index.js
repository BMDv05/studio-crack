'use strict';
const app = require('./app');
const { config } = require('./config');
const { seedAdmin } = require('./middleware/auth');

async function main() {
  await seedAdmin();
  app.listen(config.port, () => {
    console.log(`Double H Studio API listening on http://localhost:${config.port}`);
    console.log(`CORS origin: ${config.clientOrigin}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
