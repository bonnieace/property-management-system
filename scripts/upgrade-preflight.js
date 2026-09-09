require('dotenv').config();
const db=require('../src/db');
const {inspectUpgrade}=require('../src/upgradePreflight');
(async()=>{
  try{
    const report=await db.transaction(async trx=>{
      await trx.raw('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      return inspectUpgrade(trx);
    });
    console.log(JSON.stringify(report,null,2));
    if(!report.ok)process.exitCode=1;
  }catch{console.error('Preflight could not complete. Check database access and that migrations 001–017 are installed. No data was changed.');process.exitCode=1;}
  finally{await db.destroy();}
})();
