const { startApp } = require('./src/bootstrap/app');

startApp().catch((err) => {
  console.error(err);
  process.exit(1);
});
