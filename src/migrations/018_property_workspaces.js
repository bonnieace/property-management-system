exports.up = async function (db) {
  await db.schema.alterTable('admin_properties', t => t.boolean('is_owner').notNullable().defaultTo(false));
  await db.schema.alterTable('tenants', t => {
    t.string('property_id', 50).nullable().references('property_id').inTable('properties');
    t.dropUnique(['tenant_phone']);
    t.unique(['property_id', 'tenant_phone']);
  });
  // Split historical shared tenants by property without losing their relationships.
  for (const tenant of await db('tenants')) {
    const contracts = await db('rental_contracts').where('tenant_id', tenant.id);
    const deposits = await db('rental_deposits').where('tenant_id', tenant.id);
    const slugs = [...new Set([...contracts, ...deposits].map(r => r.property_id))];
    for (const [index, slug] of slugs.entries()) {
      let id = tenant.id;
      if (index === 0) await db('tenants').where({ id }).update({ property_id: slug });
      else {
        const { id: unused, ...copy } = tenant;
        [{ id }] = await db('tenants').insert({ ...copy, property_id: slug }).returning('id');
        const contractIds = contracts.filter(c => c.property_id === slug).map(c => c.id);
        await db('rental_contracts').whereIn('id', contractIds).update({ tenant_id: id });
        await db('rental_payments').whereIn('contract_id', contractIds).update({ tenant_id: id });
        await db('rental_deposits').where({ tenant_id: tenant.id, property_id: slug }).update({ tenant_id: id });
      }
    }
  }
  await db.schema.createTable('admin_sessions', t => {
    t.string('token_hash', 64).primary();
    t.integer('admin_id').notNullable().references('id').inTable('admin_users').onDelete('CASCADE');
    t.timestamp('expires_at').notNullable().index();
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now());
  });
  await db.schema.createTable('property_invitations', t => {
    t.increments('id');
    t.integer('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    t.string('email', 100).notNullable();
    t.string('token_hash', 64).unique().notNullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('accepted_at');
    t.timestamp('created_at').defaultTo(db.fn.now());
  });
  await db.schema.createTable('property_websites', t => {
    t.integer('property_id').primary().references('id').inTable('properties').onDelete('CASCADE');
    t.jsonb('draft').notNullable().defaultTo('{}');
    t.jsonb('published');
    t.integer('version').notNullable().defaultTo(1);
    t.timestamp('published_at');
    t.timestamps(true, true);
  });
  // Preserve already public properties; new properties start as drafts.
  for (const p of await db('properties')) {
    let features = p.features || [];
    if (typeof features === 'string') { try { features = JSON.parse(features); } catch { features = []; } }
    const content = {
      name: p.name, tagline: p.tagline || '', description: p.description || '',
      hero_image_url: p.hero_image_url || '', address: p.address || '', city: p.city || '',
      contact_phone: p.contact_phone || '', email: p.email || '', maps_url: p.maps_url || '',
      features: Array.isArray(features) ? features : [], gallery: [], about_title: 'Make yourself at home',
      about_text: p.description || '', policies: '', seo_description: p.description?.slice(0, 160) || ''
    };
    await db('property_websites').insert({ property_id: p.id, draft: JSON.stringify(content), published: JSON.stringify(content), published_at: db.fn.now() });
  }
  await db.schema.createTable('property_merchant_settings', t => {
    t.integer('property_id').primary().references('id').inTable('properties').onDelete('CASCADE');
    t.text('credentials_encrypted').notNullable();
    t.string('callback_token', 64).unique().notNullable();
    t.boolean('enabled').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });
  await db.schema.createTable('payment_attempts', t => {
    t.uuid('id').primary();
    t.string('property_id', 50).notNullable().references('property_id').inTable('properties');
    t.integer('unit_id').notNullable().references('id').inTable('units');
    t.string('idempotency_key', 100).notNullable();
    t.string('request_hash', 64).notNullable();
    t.string('access_token_hash', 64).notNullable();
    t.string('kind', 10).notNullable();
    t.uuid('record_id').notNullable();
    t.string('checkout_request_id', 100).unique();
    t.string('merchant_request_id', 100);
    t.integer('amount_kes').notNullable();
    t.string('phone', 20).notNullable();
    t.string('status', 30).notNullable().defaultTo('initiating');
    t.jsonb('callback');
    t.string('receipt', 50).unique();
    t.timestamp('expires_at').notNullable();
    t.timestamps(true, true);
    t.unique(['property_id', 'idempotency_key']);
  });
  await db.schema.createTable('payment_ledger', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('contract_id').notNullable().references('id').inTable('rental_contracts');
    t.uuid('payment_id').notNullable().references('id').inTable('rental_payments');
    t.string('idempotency_key', 100).notNullable();
    t.integer('amount_kes').notNullable();
    t.string('receipt', 50);
    t.timestamp('created_at').defaultTo(db.fn.now());
    t.unique(['contract_id', 'idempotency_key']);
  });
  await db.schema.createTable('rate_limits', t => {
    t.string('key', 64).primary(); t.integer('count').notNullable(); t.bigInteger('expires_at').notNullable().index();
  });
  await db.schema.createTable('property_activity', t => {
    t.increments('id'); t.string('property_id', 50).nullable(); t.integer('admin_id').nullable();
    t.string('action', 100).notNullable(); t.string('record_id', 100).nullable();
    t.timestamp('created_at').defaultTo(db.fn.now()); t.index(['property_id', 'created_at']);
  });
  await db.schema.alterTable('bookings', t => t.text('admin_notes').nullable());
};
exports.down = async function () {
  throw new Error('Workspace migration is forward-only. Restore a verified pre-migration backup to roll back.');
};
