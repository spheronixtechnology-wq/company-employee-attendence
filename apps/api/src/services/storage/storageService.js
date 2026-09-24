const supabaseStorage = require('./supabaseStorage');

/**
 * Storage Abstraction Service
 * Routes storage operations to the correct provider based on environment configuration.
 * Controllers should only ever interact with this service.
 */

const getProvider = () => {
  return process.env.STORAGE_PROVIDER || 'supabase';
};

/**
 * Uploads a file buffer to the configured storage provider.
 * @param {Buffer} buffer The file buffer
 * @param {string} key The full storage path/key
 * @param {string} contentType The MIME type of the file
 * @returns {Promise<string>} The storage key if successful
 */
const uploadFile = async (buffer, key, contentType) => {
  const provider = getProvider();
  
  if (provider === 'supabase') {
    return await supabaseStorage.uploadFile(buffer, key, contentType);
  }
  
  // Future: else if (provider === 'r2') { ... }
  
  throw new Error(`Unsupported storage provider: ${provider}`);
};

/**
 * Deletes a file from the configured storage provider.
 * @param {string} key The storage key of the file
 * @returns {Promise<void>}
 */
const deleteFile = async (key) => {
  const provider = getProvider();
  
  if (provider === 'supabase') {
    return await supabaseStorage.deleteFile(key);
  }
  
  throw new Error(`Unsupported storage provider: ${provider}`);
};

/**
 * Generates a temporary signed URL for downloading/previewing a private file.
 * @param {string} key The storage key of the file
 * @param {number} expiresIn Optional custom expiry time in seconds (overrides env)
 * @returns {Promise<string>} The signed URL
 */
const getSignedUrl = async (key, expiresIn) => {
  const provider = getProvider();
  
  // Use explicit expiresIn, fallback to env variable, fallback to default 300
  const expiry = expiresIn || parseInt(process.env.SUPABASE_SIGNED_URL_EXPIRES, 10) || 300;
  
  if (provider === 'supabase') {
    return await supabaseStorage.getSignedUrl(key, expiry);
  }
  
  throw new Error(`Unsupported storage provider: ${provider}`);
};

module.exports = {
  uploadFile,
  deleteFile,
  getSignedUrl
};
