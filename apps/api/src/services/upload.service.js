// Stub upload service to prevent crashes until fully implemented
const uploadImage = async (file) => {
  console.log('Stub uploadImage called');
  return { url: 'https://example.com/stub-image.jpg' };
};

const deleteImage = async (fileUrl) => {
  console.log('Stub deleteImage called');
  return true;
};

const getFileUrl = (filename, subfolder = 'daily-logs') => {
  if (!filename) return null;
  // Express serves /uploads statically from path.join(__dirname, '..', uploadDir)
  return `/uploads/${subfolder}/${filename}`;
};

module.exports = {
  uploadImage,
  deleteImage,
  getFileUrl,
};
