require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const DailyLog = require('../models/DailyLog');
const storageService = require('../services/storage/storageService');
const connectDB = require('../config/db');

// MUST BE TRUE FOR INITIAL RUN!
const DRY_RUN = false;

const validateBase64 = (dataUri) => {
  if (!dataUri || !dataUri.startsWith('data:')) return null;
  const parts = dataUri.split(',');
  if (parts.length !== 2) return null;
  
  const header = parts[0];
  const base64Data = parts[1];
  
  const mimeMatch = header.match(/^data:([a-zA-Z0-9-+/.]+)(;[a-zA-Z0-9-]+=[a-zA-Z0-9-]+)*;base64$/);
  if (!mimeMatch) return null;
  
  const mimeType = mimeMatch[1];
  const buffer = Buffer.from(base64Data, 'base64');
  
  if (buffer.length === 0) return null;
  
  return { mimeType, buffer };
};

const runMigration = async () => {
  console.log('===================================================');
  console.log(`🚀 STARTING BASE64 MIGRATION (DRY_RUN: ${DRY_RUN})`);
  console.log('===================================================');

  try {
    await connectDB();
    console.log('Connected to MongoDB.\n');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  // Final Stats
  let totalLogsCount = 0;
  let originallyContainingBase64 = 0;
  
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let manualReviewCount = 0;

  try {
    totalLogsCount = await DailyLog.countDocuments();
    originallyContainingBase64 = await DailyLog.countDocuments({
      $or: [
        { documentUrl: { $regex: /^data:/ } },
        { attachmentUrl: { $regex: /^data:/ } }
      ]
    });
    
    console.log(`Total DailyLogs in database: ${totalLogsCount}`);
    console.log(`Total Records originally containing Base64: ${originallyContainingBase64}\n`);

    // Fetch IDs only
    const query = {
      "document.storageKey": { $exists: false },
      $or: [
        { documentUrl: { $regex: /^data:/ } },
        { attachmentUrl: { $regex: /^data:/ } }
      ]
    };
    
    const logsToProcess = await DailyLog.find(query).select('_id userId').lean();
    console.log(`\nFound ${logsToProcess.length} pending legacy records to process.\n`);

    for (let i = 0; i < logsToProcess.length; i++) {
      const logStub = logsToProcess[i];
      console.log(`Processing Log ID: ${logStub._id} (User: ${logStub.userId})`);
      
      // Load the FULL document into memory (one at a time)
      const log = await DailyLog.findById(logStub._id);
      
      if (!log) {
        console.log(`⚠️  [SKIPPED] Log not found in DB anymore.`);
        skipCount++;
        continue;
      }
      
      const docUrl = log.documentUrl || '';
      const attUrl = log.attachmentUrl || '';
      
      const hasDocBase64 = docUrl.startsWith('data:');
      const hasAttBase64 = attUrl.startsWith('data:');
      
      // Step A: Conflict Resolution
      if (hasDocBase64 && hasAttBase64 && docUrl !== attUrl) {
        console.log(`⚠️  [MANUAL_REVIEW] Document URL and Attachment URL both exist and differ.`);
        manualReviewCount++;
        continue;
      }
      
      const base64Source = hasDocBase64 ? docUrl : attUrl;
      
      // Step B: Validate
      const validation = validateBase64(base64Source);
      if (!validation) {
        console.log(`❌ [FAILED] Invalid Base64 payload or 0 byte buffer.`);
        failCount++;
        continue;
      }
      
      const { mimeType, buffer } = validation;
      
      let ext = 'bin';
      if (mimeType.includes('pdf')) ext = 'pdf';
      else if (mimeType.includes('word')) ext = 'docx';
      else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) ext = 'xlsx';
      else if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      
      const originalName = log.documentName || `legacy_doc.${ext}`;
      const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storageKey = `daily-logs/${log.userId}/legacy/${log._id}-${Date.now()}-${safeName}`;
      
      const fileSize = log.documentSize || buffer.length;
      const fileMime = log.documentMimeType || mimeType;

      if (DRY_RUN) {
        console.log(`✅ [DRY_RUN SUCCESS] Ready to migrate to: ${storageKey}`);
        console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB, Mime: ${fileMime}`);
        successCount++;
        continue;
      }

      // REAL RUN
      let uploadResultKey = null;
      try {
        console.log(`   Uploading to Supabase: ${storageKey}`);
        uploadResultKey = await storageService.uploadFile(buffer, storageKey, fileMime);
      } catch (uploadErr) {
        console.log(`❌ [FAILED] Supabase Upload Error: ${uploadErr.message}`);
        failCount++;
        continue;
      }

      if (!uploadResultKey) {
        console.log(`❌ [FAILED] Upload did not return a valid key.`);
        failCount++;
        continue;
      }

      // Step E: Conditional Mongo Update
      const newDocMetadata = {
        storageProvider: 'supabase',
        storageKey: uploadResultKey,
        fileName: originalName,
        mimeType: fileMime,
        fileSize: fileSize
      };

      try {
        const updateResult = await DailyLog.updateOne(
          {
            _id: log._id,
            "document.storageKey": { $exists: false },
            documentUrl: log.documentUrl,
            attachmentUrl: log.attachmentUrl
          },
          {
            $set: { document: newDocMetadata }
          }
        );

        if (updateResult.modifiedCount !== 1) {
          console.log(`❌ [FAILED] Mongo Race Condition. Document modified by another process. Rolling back Supabase.`);
          await storageService.deleteFile(uploadResultKey);
          failCount++;
          continue;
        }

        // Final Step: Unset base64 fields safely
        await DailyLog.updateOne(
          { _id: log._id, "document.storageKey": uploadResultKey },
          { $unset: { documentUrl: "", attachmentUrl: "" } }
        );

        console.log(`✅ [SUCCESS] Migrated completely and cleaned up MongoDB.`);
        successCount++;

      } catch (mongoErr) {
        console.log(`❌ [FAILED] Mongo Update Error: ${mongoErr.message}. Rolling back Supabase.`);
        await storageService.deleteFile(uploadResultKey);
        failCount++;
      }
    }
  } catch (err) {
    console.error('Fatal Error during migration loop:', err);
  } finally {
    
    console.log('\n===================================================');
    console.log('📊 FINAL MIGRATION REPORT');
    console.log('===================================================');
    console.log(`- Total DailyLogs in Database: ${totalLogsCount}`);
    console.log(`- Total Records originally containing Base64: ${originallyContainingBase64}\n`);
    console.log(`- ✅ Successfully Migrated (or Ready if DRY RUN): ${successCount}`);
    console.log(`- ❌ Failed: ${failCount}`);
    console.log(`- ⚠️ Manual Review Needed: ${manualReviewCount}`);
    console.log(`- ⏭️ Skipped: ${skipCount}\n`);

    const finalStorageCount = await DailyLog.countDocuments({ "document.storageKey": { $exists: true } });
    const finalDocUrlBase64 = await DailyLog.countDocuments({ documentUrl: { $regex: /^data:/ } });
    const finalAttUrlBase64 = await DailyLog.countDocuments({ attachmentUrl: { $regex: /^data:/ } });

    console.log(`- Total Records now utilizing Supabase: ${finalStorageCount}`);
    console.log(`- Total Remaining documentUrl Base64: ${finalDocUrlBase64}`);
    console.log(`- Total Remaining attachmentUrl Base64: ${finalAttUrlBase64}`);
    console.log('===================================================\n');
    
    process.exit(0);
  }
};

runMigration();
