// Fix: Rename requestType 'permanent' to 'register' to match new enum
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const db = mongoose.connection.db;
  const result = await db.collection('devicerequests').updateMany(
    { requestType: 'permanent' },
    { $set: { requestType: 'register' } }
  );
  console.log('Fixed', result.modifiedCount, 'device requests (permanent -> register)');
  
  // Show all pending requests
  const pending = await db.collection('devicerequests').find({ status: 'pending' }).toArray();
  console.log('Pending requests:', pending.map(r => ({ id: r._id, type: r.requestType, status: r.status })));
  
  await mongoose.disconnect();
  console.log('Done.');
}

fix().catch(console.error);
