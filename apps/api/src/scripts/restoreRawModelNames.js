const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const DeviceRequest = mongoose.model('DeviceRequest', new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    requestedDeviceLabel: String,
    status: String,
  }, { strict: false }));

  const RegisteredDevice = mongoose.model('RegisteredDevice', new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    deviceLabel: String,
    status: String,
  }, { strict: false }));

  const reqUpdate1 = await DeviceRequest.updateMany(
    { requestedDeviceLabel: /Vivo T4 5G/i },
    { $set: { requestedDeviceLabel: 'V2502 · Android 16.0.0' } }
  );
  console.log('Restored DeviceRequests (Vivo T4 -> V2502):', reqUpdate1.modifiedCount);

  const reqUpdate2 = await DeviceRequest.updateMany(
    { requestedDeviceLabel: /Vivo Y75 5G/i },
    { $set: { requestedDeviceLabel: 'V2142 · Android 14.0.0' } }
  );
  console.log('Restored DeviceRequests (Vivo Y75 -> V2142):', reqUpdate2.modifiedCount);

  const devUpdate1 = await RegisteredDevice.updateMany(
    { deviceLabel: /Vivo T4 5G/i },
    { $set: { deviceLabel: 'V2502 · Android 16.0.0' } }
  );
  console.log('Restored RegisteredDevices (Vivo T4 -> V2502):', devUpdate1.modifiedCount);

  const devUpdate2 = await RegisteredDevice.updateMany(
    { deviceLabel: /Vivo Y75 5G/i },
    { $set: { deviceLabel: 'V2142 · Android 14.0.0' } }
  );
  console.log('Restored RegisteredDevices (Vivo Y75 -> V2142):', devUpdate2.modifiedCount);

  const pending = await DeviceRequest.find({ status: 'pending' }).lean();
  console.log('Current Pending Device Requests:');
  pending.forEach(r => console.log(`- ID: ${r._id}, Label: "${r.requestedDeviceLabel}"`));

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
