const mongoose = require('mongoose');

async function dropDb(dbName) {
  const uri = `mongodb+srv://spheronixtechnology_db_user:FFY247Z0tqe1HEqY@college-attendence-syst.5wegrh5.mongodb.net/${dbName}`;
  
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    await conn.dropDatabase();
    console.log(`Dropped '${dbName}' database.`);
  } catch (e) {
    console.log(`Could not drop '${dbName}':`, e.message);
  } finally {
    await conn.close();
  }
}

async function run() {
  await dropDb('test');
  await dropDb('sample_mflix');
  console.log("Cleanup finished.");
}

run().catch(console.dir);
