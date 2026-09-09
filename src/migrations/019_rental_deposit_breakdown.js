exports.up = async function (db) {
  await db.schema.alterTable('rental_deposits', t => {
    t.integer('monthly_rent_kes').nullable();
    t.integer('security_deposit_kes').nullable();
    t.integer('utilities_deposit_kes').nullable();
  });
  await db.raw('CREATE UNIQUE INDEX admin_users_username_lower_unique ON admin_users (lower(username))');
  await db.raw('CREATE UNIQUE INDEX admin_users_email_lower_unique ON admin_users (lower(email))');
};
exports.down = async function () { throw new Error('Forward-only migration: restore a verified backup to roll back.'); };
