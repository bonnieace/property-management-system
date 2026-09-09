// Keep existing frontend URLs on the same authenticated, scoped implementation.
const express = require('express');
const router = express.Router();
const admin = require('./adminRoutes');
router.use((req, res, next) => { req.url = `/bookings${req.url === '/' ? '' : req.url}`; admin(req, res, next); });
module.exports = router;
