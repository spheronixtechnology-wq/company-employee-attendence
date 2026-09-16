require('dotenv').config({ path: 'apps/api/.env' });
const mongoose = require('mongoose');
const Team = require('./apps/api/src/models/Team');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const teams = ['Recruitment', 'T&P'];
  
  for (const name of teams) {
    const existing = await Team.findOne({ name });
    if (!existing) {
      const team = new Team({ name });
      await team.save();
      console.log(`Created team: ${name}`);
    } else {
      console.log(`Team already exists: ${name}`);
    }
  }
  
  mongoose.connection.close();
}

seed().catch(console.error);
