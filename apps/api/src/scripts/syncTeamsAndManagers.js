require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');

async function sync() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found in env');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Find managers
  const managers = await User.find({ role: 'manager' });
  console.log(`Found ${managers.length} managers:`);
  for (const m of managers) {
    console.log(` - ${m.name} (${m.email}) [id: ${m._id}], teamId: ${m.teamId}`);
  }

  // Find teams
  const teams = await Team.find();
  console.log(`\nFound ${teams.length} teams:`);
  for (const t of teams) {
    console.log(` - Team "${t.name}" [id: ${t._id}], current leadUserId: ${t.leadUserId}`);
  }

  // 1. Marketing team -> Assign to Yash 2 (yashwanthkumar@gmail.com)
  const yash2 = await User.findOne({ email: 'yashwanthkumar@gmail.com' });
  const marketingTeam = await Team.findOne({ name: 'Marketing' });
  if (yash2 && marketingTeam) {
    marketingTeam.leadUserId = yash2._id;
    await marketingTeam.save();
    console.log(`\nUpdated Marketing team (${marketingTeam._id}) leadUserId to Yash 2 (${yash2._id})`);
  }

  // 2. Technical team -> Ensure lead is Yash 1 (yashwanthkumar87657@gmail.com)
  const yash1 = await User.findOne({ email: 'yashwanthkumar87657@gmail.com' });
  const technicalTeam = await Team.findOne({ name: 'Technical' });
  if (yash1 && technicalTeam) {
    technicalTeam.leadUserId = yash1._id;
    await technicalTeam.save();
    console.log(`Updated Technical team (${technicalTeam._id}) leadUserId to Yash 1 (${yash1._id})`);
  }

  // For any other manager with a teamId, ensure that team's leadUserId points to that manager if null or misassigned
  for (const m of managers) {
    if (m.teamId) {
      const team = await Team.findById(m.teamId);
      if (team && (!team.leadUserId || team.leadUserId.toString() !== m._id.toString())) {
        // If team lead is already another manager assigned to this team, keep it, else set
        console.log(`Manager ${m.email} has teamId ${team.name}`);
      }
    }
  }

  console.log('\n--- Sync Verification ---');
  const updatedTeams = await Team.find().populate('leadUserId', 'name email');
  for (const t of updatedTeams) {
    console.log(`Team: ${t.name.padEnd(15)} Lead: ${t.leadUserId ? `${t.leadUserId.name} (${t.leadUserId.email})` : 'None'}`);
  }

  await mongoose.disconnect();
  console.log('\nSync completed successfully');
}

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
