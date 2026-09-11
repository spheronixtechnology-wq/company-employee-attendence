const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const managers = await mongoose.connection.db.collection('users').find({ role: 'manager' }).toArray();
  console.log('Managers:', managers.map(m => ({ id: m._id, name: m.name, email: m.email })));
  const ids = managers.map(m => m._id);
  const devices = await mongoose.connection.db.collection('registereddevices').find({ userId: { $in: ids } }).toArray();
  console.log('Manager Devices:', devices.map(d => ({ userId: d.userId, status: d.status, label: d.deviceLabel })));
  process.exit();
})();
