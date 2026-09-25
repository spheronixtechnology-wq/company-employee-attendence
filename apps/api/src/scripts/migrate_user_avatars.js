const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const User = require('../models/User');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME.replace(/^"|"$/g, '');

const validateBase64 = (dataUri) => {
    if (!dataUri || !dataUri.startsWith('data:')) return null;
    const parts = dataUri.split(',');
    if (parts.length !== 2) return null;
    
    const header = parts[0];
    const base64Data = parts[1];
    const mimeMatch = header.match(/^data:([a-zA-Z0-9-+/.]+)(;[a-zA-Z0-9-]+=[a-zA-Z0-9-]+)*;base64$/);
    if (!mimeMatch) return null;
    
    return { mimeType: mimeMatch[1], buffer: Buffer.from(base64Data, 'base64') };
};

async function migrateAvatars() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.\n');
        
        const users = await User.find({ avatarUrl: { $regex: /^data:/ } });
        console.log(`Found ${users.length} users with Base64 avatars to migrate.\n`);

        for (const user of users) {
            const validation = validateBase64(user.avatarUrl);
            if (!validation) {
                console.log(`Failed to validate Base64 for user ${user.email}`);
                continue;
            }

            const { mimeType, buffer } = validation;
            const ext = mimeType.split('/')[1] || 'png';
            const storageKey = `avatars/${user._id}-${Date.now()}.${ext}`;

            console.log(`Uploading avatar for ${user.email} (${(buffer.length / 1024).toFixed(2)} KB)...`);
            
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(storageKey, buffer, { contentType: mimeType, upsert: true });

            if (error) {
                console.error(`Supabase upload error for ${user.email}:`, error.message);
                continue;
            }

            const { data: publicUrlData } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(storageKey);

            const publicUrl = publicUrlData.publicUrl;

            // Update user in MongoDB
            user.avatarUrl = publicUrl;
            await user.save({ validateBeforeSave: false });

            console.log(`Successfully migrated ${user.email}!`);
            console.log(`New URL: ${publicUrl}\n`);
        }

        console.log('--- Migration Complete ---');
        process.exit(0);
    } catch (error) {
        console.error('Error during migration:', error);
        process.exit(1);
    }
}

migrateAvatars();
