require('dotenv').config();
const path = require('node:path');
const common = {
  client: 'pg', migrations: { directory: path.join(__dirname, 'src/migrations') },
  seeds: { directory: path.join(__dirname, 'src/seeds') },
  pool: { min: 0, max: Number(process.env.DATABASE_POOL_MAX || 10), acquireTimeoutMillis: 10000 },
  acquireConnectionTimeout: 10000
};
const connection = process.env.DATABASE_URL || { host: process.env.DATABASE_HOST || 'localhost', port: process.env.DATABASE_PORT || 5432,
  user: process.env.DATABASE_USER || 'postgres', password: process.env.DATABASE_USER_PASSWORD || 'postgres', database: process.env.DATABASE_NAME || 'nyathira_bookings' };
module.exports = { development: { ...common, connection }, production: { ...common, connection: process.env.DATABASE_URL } };
