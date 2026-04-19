#!/usr/bin/env node
import('../dist/cli/main.js')
  .then((m) => m.main(process.argv))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
