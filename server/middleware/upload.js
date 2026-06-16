const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/marshal-uploads';
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Route handlers must set req.uploadEventId and req.uploadMarshalId before
// this middleware runs (after resolving the invitation token or application).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const eventId = req.uploadEventId || 'general';
    const dir = path.join(UPLOAD_DIR, 'licences', String(eventId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ts = Date.now();
    const marshalId = req.uploadMarshalId || 'unknown';
    cb(null, `${marshalId}-${ts}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, ALLOWED_EXT.includes(ext));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

// Supersede an existing licence file by renaming it with a .superseded suffix
// (kept for audit trail rather than deleted).
function supersedeOldLicence(oldPath) {
  if (!oldPath) return;
  try {
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, `${oldPath}.superseded.${Date.now()}`);
    }
  } catch (err) {
    console.error('Failed to supersede old licence file:', err.message);
  }
}

module.exports = { upload, supersedeOldLicence, UPLOAD_DIR, ALLOWED_EXT, MAX_SIZE };
