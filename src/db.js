/**
 * Database connection & initialization
 * Exports knex instance for use in other modules
 */

require('dotenv').config();
const knex = require('knex');
const config = require('../knexfile');

// Initialize knex with appropriate environment config
const db = knex(config[process.env.NODE_ENV || 'development']);

module.exports = db;
