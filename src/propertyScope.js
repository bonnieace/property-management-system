const db = require('./db');
const { HttpError } = require('./http');
function requestedProperty(req) { return req.headers['x-property-id'] || req.query.property_id || req.query.property || req.query.propertyId; }
function scope(query, req, column = 'property_id') {
  const selected = requestedProperty(req);
  if (selected) {
    if (typeof selected !== 'string') throw new HttpError(400, 'Select a property');
    if (req.admin.role !== 'full_admin' && !req.admin.properties.some(p => p.property_id === selected)) throw new HttpError(403, 'You do not have access to this property');
    query.where(column, selected);
  } else if (req.admin.role !== 'full_admin') query.whereIn(column, req.admin.properties.map(p => p.property_id));
  return query;
}
async function property(req, id, owner = false, connection = db) {
  const value = String(id || requestedProperty(req) || '');
  const row = await connection('properties').where(/^\d+$/.test(value) ? 'id' : 'property_id', value).first();
  if (!row) throw new HttpError(404, 'Property not found');
  const assignment = req.admin.properties.find(p => p.id === row.id);
  if (req.admin.role !== 'full_admin' && (!assignment || (owner && !assignment.is_owner))) throw new HttpError(403, owner ? 'Property owner access required' : 'You do not have access to this property');
  const selected = requestedProperty(req);
  if (selected && row.property_id !== selected) throw new HttpError(403, 'This record belongs to a different property');
  return row;
}
async function unit(req, id, connection = db) {
  const value = String(id || '');
  const row = await connection('units').where(/^\d+$/.test(value) ? 'id' : 'unit_id', value).first();
  if (!row) throw new HttpError(404, 'Unit not found');
  await property(req, row.property_id, false, connection); return row;
}
function unitScope(query, req, column = 'unit_id') { return query.whereIn(column, scope(db('units').select('id'), req)); }
async function record(req, table, id, connection = db) {
  const row = await connection(table).where('id', id).first();
  if (!row) throw new HttpError(404, 'Record not found');
  if (row.property_id) await property(req, row.property_id, false, connection);
  else if (row.unit_id) await unit(req, row.unit_id, connection);
  else if (req.admin.role !== 'full_admin') throw new HttpError(403, 'Record is not assigned to your property');
  return row;
}
async function activity(req, action, propertyId, recordId, connection = db) {
  await connection('property_activity').insert({ admin_id: req.admin?.id, action, property_id: propertyId || null, record_id: recordId ? String(recordId) : null });
}
module.exports = { requestedProperty, scope, property, unit, unitScope, record, activity };
