const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure daily-logs upload directory exists
const uploadDailyLogsDir = path.join(__dirname, '..', '..', 'uploads', 'daily-logs');
if (!fs.existsSync(uploadDailyLogsDir)) {
  fs.mkdirSync(uploadDailyLogsDir, { recursive: true });
}

// Memory Storage configuration for Base64 data conversion
const storage = multer.memoryStorage();

// Allowed document extensions and mime types (including Excel & CSV spreadsheets)
const ALLOWED_EXTENSIONS = ['.doc', '.docx', '.pdf', '.txt', '.rtf', '.odt', '.xlsx', '.xls', '.csv'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const error = new Error('Invalid file type. Only documents and spreadsheets (.doc, .docx, .pdf, .txt, .xlsx, .xls, .csv) up to 1MB are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }
  cb(null, true);
};

// 1MB size limit in bytes
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

/**
 * Middleware wrapper for Daily Log document upload.
 * Catches Multer errors (file too large, invalid format) and responds with clean 400 errors.
 * Accepts field names 'document', 'file', or 'attachment'.
 */
const uploadDailyLogDoc = (req, res, next) => {
  // Allow accepting field name 'document' or 'attachment' or 'file'
  const uploader = upload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'attachment', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  uploader(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds 1MB limit. Please upload a document 1MB or smaller.',
        });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error',
      });
    }

    // Normalize req.file from fields so downstream controllers get req.file
    if (req.files) {
      const singleFile = req.files.document?.[0] || req.files.attachment?.[0] || req.files.file?.[0];
      if (singleFile) {
        req.file = singleFile;
      }
    }

    next();
  });
};

const avatarFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
  if (!allowed.includes(ext)) {
    return cb(new Error('Invalid image type.'), false);
  }
  cb(null, true);
};

const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: avatarFileFilter,
}).single('avatar');

const uploadAvatarImage = (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

module.exports = {
  uploadDailyLogDoc,
  uploadAvatarImage,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
};
