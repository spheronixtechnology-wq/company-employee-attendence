const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const User = require('../models/User');

async function checkUserSizesDeeply() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.\n');
        
        const users = await User.find({}).select('+passwordHash +mfaSecret +mfaPendingSecret').lean();
        console.log(`Total users found: ${users.length}\n`);

        let totalSize = 0;
        let base64Users = 0;
        let base64TotalSize = 0;

        for (const user of users) {
            let docSize = Buffer.byteLength(JSON.stringify(user), 'utf8');
            totalSize += docSize;
            
            let hasBase64 = false;
            let base64Size = 0;
            
            for (const [key, value] of Object.entries(user)) {
                if (typeof value === 'string' && value.length > 1024 && value.startsWith('data:')) {
                    hasBase64 = true;
                    base64Size += value.length;
                }
            }

            if (hasBase64) {
                base64Users++;
                base64TotalSize += docSize;
                console.log(`[!] User: ${user.email} (ID: ${user._id})`);
                console.log(`    - Document Size: ${(docSize / 1024).toFixed(2)} KB`);
                console.log(`    - CONTAINS BASE64 IMAGE (Avatar size: ${(base64Size / 1024).toFixed(2)} KB)\n`);
            } else {
                console.log(`[OK] User: ${user.email} (ID: ${user._id})`);
                console.log(`    - Document Size: ${(docSize / 1024).toFixed(2)} KB\n`);
            }
        }
        
        console.log(`--- SUMMARY ---`);
        console.log(`Total Collection Data Size (approx): ${(totalSize / 1024).toFixed(2)} KB`);
        console.log(`Total size of the ${base64Users} users with Base64: ${(base64TotalSize / 1024).toFixed(2)} KB`);
        console.log(`Total size of the remaining ${users.length - base64Users} normal users: ${((totalSize - base64TotalSize) / 1024).toFixed(2)} KB`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error analyzing users:', error);
        process.exit(1);
    }
}

checkUserSizesDeeply();
