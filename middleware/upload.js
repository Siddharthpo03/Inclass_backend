const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, {
    recursive: true,
  });
}

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const extensionMap = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },

  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const extension = extensionMap[file.mimetype] || ".jpg";

    cb(null, `photo-${uniqueSuffix}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    const error = new Error("Only JPEG, PNG, and WebP images are allowed.");

    error.code = "INVALID_IMAGE_TYPE";

    cb(error, false);

    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
  },

  preservePath: false,
});

module.exports = upload;
