const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function analyzeDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.\n');
        console.log('--- Database Analysis ---\n');

        const modelsPath = path.resolve(__dirname, '../models');
        const modelFiles = fs.readdirSync(modelsPath).filter(file => file.endsWith('.js'));
        
        let totalStats = [];

        for (const file of modelFiles) {
            const Model = require(path.join(modelsPath, file));
            if (Model && Model.modelName) {
                const count = await Model.countDocuments();
                
                let sizeStr = '0 KB';
                if (count > 0) {
                    try {
                        const stats = await Model.aggregate([{ $collStats: { storageStats: {} } }]);
                        if (stats.length > 0 && stats[0].storageStats) {
                            const sizeBytes = stats[0].storageStats.size || 0;
                            // Format bytes to KB or MB
                            if (sizeBytes > 1024 * 1024) {
                                sizeStr = (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
                            } else {
                                sizeStr = (sizeBytes / 1024).toFixed(2) + ' KB';
                            }
                        }
                    } catch (e) {
                        sizeStr = 'N/A';
                    }
                }
                
                totalStats.push({ Model: Model.modelName, Count: count, Size: sizeStr });
            }
        }
        
        totalStats.sort((a, b) => b.Count - a.Count);
        console.table(totalStats);
        
        console.log('\n--- End of Analysis ---');
        process.exit(0);
    } catch (error) {
        console.error('Error analyzing database:', error);
        process.exit(1);
    }
}

analyzeDatabase();
