const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });
const { formatDeviceLabel } = require('../utils/deviceUtils');

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

  const pendingReqs = await DeviceRequest.find({}).lean();
  console.log('Found requests count:', pendingReqs.length);

  for (const r of pendingReqs) {
    if (r.requestedDeviceLabel) {
      const formatted = formatDeviceLabel(r.requestedDeviceLabel);
      if (formatted !== r.requestedDeviceLabel) {
        await DeviceRequest.updateOne({ _id: r._id }, { $set: { requestedDeviceLabel: formatted } });
        console.log(`Updated DeviceRequest ${r._id}: "${r.requestedDeviceLabel}" -> "${formatted}"`);
      }
    }
  }

  const registeredDevices = await RegisteredDevice.find({}).lean();
  for (const d of registeredDevices) {
    if (d.deviceLabel) {
      const formatted = formatDeviceLabel(d.deviceLabel);
      if (formatted !== d.deviceLabel) {
        await RegisteredDevice.updateOne({ _id: d._id }, { $set: { deviceLabel: formatted } });
        console.log(`Updated RegisteredDevice ${d._id}: "${d.deviceLabel}" -> "${formatted}"`);
      }
    }
  }

  console.log('Update completed successfully.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
