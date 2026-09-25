const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function checkAllBase64() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.\n');
        
        const modelsPath = path.resolve(__dirname, '../models');
        const modelFiles = fs.readdirSync(modelsPath).filter(file => file.endsWith('.js'));
        
        for (const file of modelFiles) {
            const Model = require(path.join(modelsPath, file));
            if (Model && Model.modelName) {
                const count = await Model.countDocuments();
                if (count > 0) {
                    const docs = await Model.find({}).lean();
                    let base64Count = 0;
                    for (const doc of docs) {
                        // deep search in object
                        let hasBase64 = false;
                        const searchObj = (obj) => {
                            for (const key in obj) {
                                if (typeof obj[key] === 'string' && obj[key].length > 1024 && obj[key].startsWith('data:')) {
                                    hasBase64 = true;
                                    console.log(`[!] Found Base64 in Collection: ${Model.modelName}, ID: ${doc._id}, Field: ${key}, Size: ${(obj[key].length / 1024).toFixed(2)} KB`);
                                } else if (obj[key] !== null && typeof obj[key] === 'object') {
                                    searchObj(obj[key]);
                                }
                            }
                        };
                        searchObj(doc);
                        if (hasBase64) base64Count++;
                    }
                    if (base64Count > 0) {
                        console.log(`--- Model ${Model.modelName} has ${base64Count} docs with Base64 strings.\n`);
                    }
                }
            }
        }
        
        console.log('--- Scan Complete ---');
        process.exit(0);
    } catch (error) {
        console.error('Error during scan:', error);
        process.exit(1);
    }
}

checkAllBase64();
