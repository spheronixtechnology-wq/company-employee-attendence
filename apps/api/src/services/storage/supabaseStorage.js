const { createClient } = require('@supabase/supabase-js');

// Initialize the Supabase client conditionally so it doesn't crash if env vars are missing
let supabase = null;

const initSupabase = () => {
  if (supabase) return supabase;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY; // Must be the secret/service role key for backend
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_SECRET_KEY)');
  }
  
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  
  return supabase;
};

const getBucketName = () => {
  const bucketName = process.env.SUPABASE_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('Missing SUPABASE_BUCKET_NAME environment variable');
  }
  return bucketName;
};

/**
 * Uploads a file buffer to Supabase Storage.
 * @param {Buffer} buffer The file buffer
 * @param {string} key The full storage path/key (e.g., 'daily-logs/user123/doc.pdf')
 * @param {string} contentType The MIME type of the file
 * @returns {Promise<string>} The storage key if successful
 */
const uploadFile = async (buffer, key, contentType) => {
  const client = initSupabase();
  const bucketName = getBucketName();
  
  const { data, error } = await client.storage
    .from(bucketName)
    .upload(key, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: true
    });
    
  if (error) {
    throw new Error(`Failed to upload to Supabase: ${error.message}`);
  }
  
  return data.path; // This is the storageKey
};

/**
 * Deletes a file from Supabase Storage.
 * @param {string} key The storage key of the file
 * @returns {Promise<void>}
 */
const deleteFile = async (key) => {
  const client = initSupabase();
  const bucketName = getBucketName();
  
  const { error } = await client.storage
    .from(bucketName)
    .remove([key]);
    
  if (error) {
    throw new Error(`Failed to delete from Supabase: ${error.message}`);
  }
};

/**
 * Generates a temporary signed URL for downloading/previewing a private file.
 * @param {string} key The storage key of the file
 * @param {number} expiresIn Expiry time in seconds
 * @returns {Promise<string>} The signed URL
 */
const getSignedUrl = async (key, expiresIn = 300) => {
  const client = initSupabase();
  const bucketName = getBucketName();
  
  const { data, error } = await client.storage
    .from(bucketName)
    .createSignedUrl(key, expiresIn);
    
  if (error) {
    throw new Error(`Failed to generate signed URL from Supabase: ${error.message}`);
  }
  
  return data.signedUrl;
};

module.exports = {
  uploadFile,
  deleteFile,
  getSignedUrl
};
