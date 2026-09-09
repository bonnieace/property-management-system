require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/db');
const { accountSchema } = require('../src/workspaceRoutes');
(async()=>{
  try {
    const data=accountSchema.parse({username:process.env.BOOTSTRAP_USERNAME,name:process.env.BOOTSTRAP_NAME,email:process.env.BOOTSTRAP_EMAIL,password:process.env.BOOTSTRAP_PASSWORD});
    const {password,...account}=data;
    if(await db('admin_users').where('role','full_admin').first()) throw new Error('A platform administrator already exists. Use that account to manage administrators.');
    await db('admin_users').insert({...account,password_hash:await bcrypt.hash(password,12),role:'full_admin',status:'active'});
    console.log('Platform administrator created. Remove the bootstrap environment variables.');
  }catch(err){console.error(err.name==='ZodError'?'Provide valid BOOTSTRAP_USERNAME, BOOTSTRAP_NAME, BOOTSTRAP_EMAIL and a BOOTSTRAP_PASSWORD of at least 12 characters.':err.message==='A platform administrator already exists. Use that account to manage administrators.'?err.message:'Could not create the administrator. Check migration status and account uniqueness.');process.exitCode=1;}
  finally{await db.destroy();}
})();
