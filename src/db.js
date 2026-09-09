/**
 * Database connection & initialization
 * Exports knex instance for use in other modules
 */

require('dotenv').config();
const knex = require('knex');
require('pg').types.setTypeParser(1082, value => value);
const config = require('../knexfile');

// Initialize knex with appropriate environment config
const db = knex(config[process.env.NODE_ENV === 'production' ? 'production' : 'development']);

module.exports = db;
