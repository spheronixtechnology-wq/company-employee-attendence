const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Notification = mongoose.model('Notification', new mongoose.Schema({}, { strict: false }));
  const DeviceRequest = mongoose.model('DeviceRequest', new mongoose.Schema({}, { strict: false }));
  const Team = mongoose.model('Team', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

  const manager = await User.findOne({ name: /Yash/i }).lean();
  console.log('Manager:', manager?.name, manager?._id?.toString());

  if (manager) {
    const teams = await Team.find({
      $or: [{ leadUserId: manager._id }, { _id: manager.teamId }],
      isActive: true
    }).lean();

    const teamIds = teams.map(t => t._id);
    const teamMembers = await User.find({ teamId: { $in: teamIds } }).select('_id').lean();
    const memberIds = teamMembers.map(m => m._id);

    const pendingDeviceRequestsCount = await DeviceRequest.countDocuments({
      userId: { $in: memberIds },
      status: 'pending'
    });
    console.log('Actual Pending Device Requests for Yash team:', pendingDeviceRequestsCount);

    // Mark existing notifications as read
    const updateResult = await Notification.updateMany(
      { userId: manager._id, isRead: false },
      { $set: { isRead: true } }
    );
    console.log('Updated notifications to isRead=true count:', updateResult.modifiedCount);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
