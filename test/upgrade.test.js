const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const knex=require('knex');
const {inspectUpgrade}=require('../src/upgradePreflight');
test('historical upgrade preserves shared tenants, relationships, balances and published sites', {timeout:120000}, async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {PGLiteSocketServer}=await import('@electric-sql/pglite-socket');
  const database=await PGlite.create();
  const socket=new PGLiteSocketServer({db:database,port:5440,host:'127.0.0.1'});
  await socket.start();
  const directory=path.resolve('src/migrations');
  const db=knex({client:'pg',connection:'postgresql://postgres:postgres@127.0.0.1:5440/postgres',pool:{min:0,max:1},migrations:{directory}});
  try{
    const source={getMigrations:async()=>fs.readdirSync(directory).filter(n=>Number(n.slice(0,3))<=17).sort(),getMigrationName:n=>n,getMigration:n=>require(path.join(directory,n))};
    await db.migrate.latest({migrationSource:source});
    const [first,second]=await db('properties').insert([{property_id:'old-garden',name:'Garden',description:'Original introduction'},{property_id:'old-court',name:'Court'}]).returning('*');
    const units=await db('units').insert([first,second].map((p,i)=>({property_id:p.property_id,unit_id:'legacy-'+i,type:'bedsit',name:'Studio',bedrooms:0,bathrooms:1,base_price_kes:10000}))).returning('*');
    const [tenant]=await db('tenants').insert({tenant_name:'Shared historical tenant',tenant_phone:'254712345678',notes:'Retain history'}).returning('*');
    const [orphan]=await db('tenants').insert({tenant_name:'Unassigned historical tenant',tenant_phone:'254712345679'}).returning('*');
    const contracts=await db('rental_contracts').insert(units.map(u=>({tenant_id:tenant.id,unit_id:u.id,property_id:u.property_id,start_date:'2025-01-01',monthly_rent_kes:10000}))).returning('*');
    const payments=await db('rental_payments').insert(contracts.map(c=>({contract_id:c.id,tenant_id:tenant.id,unit_id:c.unit_id,month:1,year:2025,amount_due_kes:10000,amount_paid_kes:6000,amount_outstanding_kes:4000,due_date:'2025-01-01',status:'partial'}))).returning('*');
    const deposits=await db('rental_deposits').insert(contracts.map(c=>({guest_name:'Shared historical tenant',guest_phone:tenant.tenant_phone,tenant_id:tenant.id,unit_id:c.unit_id,property_id:c.property_id,contract_id:c.id,intended_checkin_date:'2025-01-01',deposit_amount_kes:21000,status:'confirmed'}))).returning('*');
    let preflight=await inspectUpgrade(db);assert.equal(preflight.ok,true);assert.equal(preflight.checks.find(c=>c.code==='tenants_without_relationships').count,1);
    await db('rental_payments').where('id',payments[0].id).update({unit_id:units[1].id});
    preflight=await inspectUpgrade(db);assert.equal(preflight.ok,false);assert.equal(preflight.checks.find(c=>c.code==='payments_with_wrong_relationships').count,1);
    await db('rental_payments').where('id',payments[0].id).update({unit_id:units[0].id});
    await db.migrate.latest({migrationSource:undefined,directory});
    const split=await db('tenants').where('tenant_phone',tenant.tenant_phone);assert.equal(split.length,2);assert.deepEqual(new Set(split.map(t=>t.property_id)),new Set(['old-garden','old-court']));
    assert.equal((await db('tenants').where('id',orphan.id).first()).property_id,null);
    for(const original of contracts){
      const contract=await db('rental_contracts').where('id',original.id).first();
      const person=await db('tenants').where('id',contract.tenant_id).first();assert.equal(person.property_id,contract.property_id);assert.equal(person.notes,'Retain history');
      const payment=await db('rental_payments').where('contract_id',contract.id).first();assert.equal(payment.tenant_id,person.id);assert.equal(payment.amount_paid_kes,6000);assert.equal(payment.amount_outstanding_kes,4000);
      const deposit=await db('rental_deposits').where('contract_id',contract.id).first();assert.equal(deposit.tenant_id,person.id);assert.equal(deposit.deposit_amount_kes,21000);assert.equal(deposit.monthly_rent_kes,null);
    }
    assert.equal((await db('property_websites').where('property_id',first.id).first()).published.description,'Original introduction');
    assert.equal((await db('rental_payments')).length,payments.length);assert.equal((await db('rental_deposits')).length,deposits.length);
    assert.equal((await db.migrate.latest({migrationSource:undefined,directory}))[1].length,0);
  }finally{await db.destroy();await socket.stop();await database.close();}
});
