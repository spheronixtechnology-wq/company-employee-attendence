// Stub upload service to prevent crashes until fully implemented
const uploadImage = async (file) => {
  console.log('Stub uploadImage called');
  return { url: 'https://example.com/stub-image.jpg' };
};

const deleteImage = async (fileUrl) => {
  console.log('Stub deleteImage called');
  return true;
};

module.exports = {
  uploadImage,
  deleteImage
};
