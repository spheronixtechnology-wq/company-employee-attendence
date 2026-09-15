require('dotenv').config({path: '.env'}); 
require('mongoose').connect(process.env.MONGODB_URI).then(async () => { 
  const db = require('mongoose').connection.db; 
  await db.collection('officelocations').updateOne({}, { $set: { radiusMeters: 10 } }); 
  console.log('Reverted radius to 10m'); 
  process.exit(0); 
});
