// Read-only checks for historical data that cannot be safely inferred during upgrade.
async function inspectUpgrade(db) {
  const checks = [
    ['duplicate_usernames', 'blocker', 'SELECT 1 FROM admin_users GROUP BY lower(username) HAVING count(*) > 1'],
    ['duplicate_emails', 'blocker', 'SELECT 1 FROM admin_users GROUP BY lower(email) HAVING count(*) > 1'],
    ['units_without_property', 'blocker', 'SELECT u.id FROM units u LEFT JOIN properties p ON p.property_id=u.property_id WHERE p.id IS NULL'],
    ['contracts_with_wrong_property', 'blocker', 'SELECT c.id FROM rental_contracts c JOIN units u ON u.id=c.unit_id WHERE c.property_id<>u.property_id'],
    ['deposits_with_wrong_property', 'blocker', 'SELECT d.id FROM rental_deposits d JOIN units u ON u.id=d.unit_id WHERE d.property_id<>u.property_id'],
    ['bookings_with_wrong_property', 'blocker', 'SELECT b.id FROM bookings b JOIN units u ON u.id=b.unit_id WHERE b.property_id<>u.property_id'],
    ['payments_with_wrong_relationships', 'blocker', 'SELECT p.id FROM rental_payments p JOIN rental_contracts c ON c.id=p.contract_id WHERE p.tenant_id<>c.tenant_id OR p.unit_id<>c.unit_id'],
    ['deposits_with_wrong_contract', 'blocker', 'SELECT d.id FROM rental_deposits d JOIN rental_contracts c ON c.id=d.contract_id WHERE d.unit_id<>c.unit_id OR d.property_id<>c.property_id OR d.tenant_id IS DISTINCT FROM c.tenant_id'],
    ['duplicate_rent_periods', 'blocker', 'SELECT 1 FROM rental_payments GROUP BY contract_id,year,month HAVING count(*)>1'],
    ['tenants_without_relationships', 'warning', 'SELECT t.id FROM tenants t WHERE NOT EXISTS (SELECT 1 FROM rental_contracts c WHERE c.tenant_id=t.id) AND NOT EXISTS (SELECT 1 FROM rental_deposits d WHERE d.tenant_id=t.id)'],
    ['pending_legacy_payments', 'warning', "SELECT id FROM bookings WHERE status='pending' UNION ALL SELECT id FROM rental_deposits WHERE status='pending'"]
  ];
  const results=[];
  for (const [code,severity,query] of checks) {
    const result=await db.raw(`SELECT count(*) AS count FROM (${query}) findings`);
    results.push({code,severity,count:Number(result.rows[0].count)});
  }
  return { ok: !results.some(r=>r.severity==='blocker'&&r.count), checks:results };
}
module.exports={inspectUpgrade};
