// inclass-backend/routes/faceRecognition.js
// Face enrollment and recognition using FaceNet ONNX + pgvector

const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const logger = require("../utils/logger");
const { extractEmbedding, isFaceNetAvailable } = require("../services/facenet");
const { saveUserEmbedding, findBestMatch } = require("../services/faceMatcher");

function getImageBuffer(req) {
  // Multipart upload: file is saved by multer to backend/uploads
  if (req.file) {
    const imagePath = path.join(__dirname, "..", "uploads", req.file.filename);

    // Explicit existence and permission check to avoid opaque UNKNOWN read errors
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Uploaded image file not found at path: ${imagePath}`);
    }

    try {
      return fs.readFileSync(imagePath);
    } catch (err) {
      // Surface detailed context instead of generic UNKNOWN errors from fs
      throw new Error(
        `Failed to read uploaded image file at ${imagePath}: ${err.message}`,
      );
    }
  }

  // Base64 data URL in body (legacy/secondary path)
  if (req.body.image) {
    const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64Data, "base64");
  }

  return null;
}

// @route   POST /api/face/enroll
// @desc    Enroll user's face (store 512-d embedding in users.embedding)
// @access  Private (or Public during registration with userId)
router.post("/enroll", upload.single("image"), async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(401).json({ message: "User ID is required." });
    }

    const imageBuffer = getImageBuffer(req);
    if (!imageBuffer) {
      return res.status(400).json({ message: "Face image is required." });
    }

    const embedding = await extractEmbedding(imageBuffer);

    await saveUserEmbedding(userId, embedding);

    return res.status(201).json({
      message: "Face enrolled successfully.",
      embeddingSize: embedding.length,
      note: !isFaceNetAvailable()
        ? "Face recognition is using placeholder embeddings (ONNX Runtime unavailable). Attendance will work but face verification may be limited."
        : undefined,
    });
  } catch (err) {
    logger.error("FaceNet enrollment error:", err);
    res.status(500).json({
      error: "Server error during face enrollment.",
      message: err.message,
    });
  }
});

// @route   POST /api/face/recognize
// @desc    Recognize user from face image using nearest-neighbor search
// @access  Public (caller decides how to use result)
router.post("/recognize", upload.single("image"), async (req, res) => {
  try {
    const imageBuffer = getImageBuffer(req);
    if (!imageBuffer) {
      return res.status(400).json({ message: "Face image is required." });
    }

    // If face recognition is unavailable, return degraded response
    if (!isFaceNetAvailable()) {
      return res.status(503).json({
        match: false,
        message: "Face recognition is currently unavailable.",
        note: "Placeholder embeddings are being used. Real face matching is disabled.",
      });
    }

    const embedding = await extractEmbedding(imageBuffer);
    const result = await findBestMatch(embedding);

    if (!result) {
      return res.status(404).json({
        match: false,
        message: "No enrolled users found for recognition.",
      });
    }

    return res.json({
      match: result.match,
      userId: result.userId,
      name: result.name,
      distance: result.distance,
      threshold: result.threshold,
      embedding,
    });
  } catch (err) {
    logger.error("FaceNet recognition error:", err);
    res.status(500).json({
      error: "Server error during face recognition.",
      message: err.message,
    });
  }
});

module.exports = router;
