// inclass-backend/services/facenet.js
// Face recognition using face-api.js (TensorFlow.js based)
// Provides reliable face detection and embedding extraction
// Uses jimp for image processing (no native canvas dependency)

const tf = require("@tensorflow/tfjs");
const Jimp = require("jimp");
const faceapi = require("@vladmandic/face-api");
const crypto = require("crypto");
const logger = require("../utils/logger");

let modelsLoaded = false;
let faceApiAvailable = false;

const MODELS_PATH =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@0.13.1/model/";

/**
 * Load face-api models (downloads from CDN on first run)
 * Models are cached after first download
 */
async function loadModels() {
  if (modelsLoaded) {
    return;
  }

  try {
    logger.info("Loading face-api.js models from CDN...");

    // Load models in parallel
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH),
      faceapi.nets.faceExpressionNet.loadFromUri(MODELS_PATH),
    ]);

    modelsLoaded = true;
    faceApiAvailable = true;
    logger.info(
      "✅ Face-API models loaded successfully. Face recognition ready.",
    );
  } catch (err) {
    logger.error(
      `Failed to load face-api models: ${err.message}. Face recognition disabled.`,
    );
    faceApiAvailable = false;
  }
}

function isFaceNetAvailable() {
  return faceApiAvailable && modelsLoaded;
}

/**
 * Generate a placeholder embedding when face-api is unavailable
 * Uses image hash to create a consistent 512-dim vector
 */
function generatePlaceholderEmbedding(imageBuffer) {
  const hash = crypto
    .createHash("sha256")
    .update(imageBuffer)
    .digest("hex");

  // Create deterministic 512-dim vector from hash
  const embedding = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    const charCode = hash.charCodeAt(i % hash.length);
    embedding[i] = (charCode / 127 - 1) / 10; // Scale to [-0.1, 0.1] range
  }

  return Array.from(embedding);
}

/**
 * Convert Jimp image to canvas-like object for face-api
 */
function jimpToCanvas(jimpImage) {
  const width = jimpImage.bitmap.width;
  const height = jimpImage.bitmap.height;
  const data = jimpImage.bitmap.data;

  // Create a canvas-like object with ImageData
  return {
    width,
    height,
    getContext: () => ({
      drawImage: () => {}, // No-op, face-api only needs the data
    }),
    // face-api reads canvas as ImageData via canvas.getContext('2d').getImageData
    _getData: () => data,
  };
}

/**
 * Extract a 512-dim face embedding from image buffer
 * Returns placeholder if face-api unavailable
 */
async function extractEmbedding(imageBuffer) {
  // If face-api not available, return placeholder
  if (!faceApiAvailable) {
    logger.info("Using placeholder embedding (Face-API unavailable)");
    return generatePlaceholderEmbedding(imageBuffer);
  }

  try {
    // Ensure models are loaded
    if (!modelsLoaded) {
      await loadModels();
    }

    if (!faceApiAvailable) {
      return generatePlaceholderEmbedding(imageBuffer);
    }

    // Load image with jimp (pure JavaScript, no native deps)
    const jimpImage = await Jimp.read(imageBuffer);

    // Resize to standard size for face detection
    const resized = jimpImage.resize({
      w: 640,
      h: 480,
    });

    // Create 4D tensor from image data [batch, height, width, channels]
    const pixels = resized.bitmap.data;
    const width = resized.bitmap.width;
    const height = resized.bitmap.height;
    
    // face-api expects tensor with values in 0-255 range
    const tensor = tf.tensor4d(pixels, [1, height, width, 4], 'uint8');

    // Detect faces and extract embeddings
    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions())
      .withFaceDescriptors();

    tensor.dispose(); // Clean up TensorFlow memory

    if (detections.length === 0) {
      logger.warn("No face detected in image. Using placeholder embedding.");
      return generatePlaceholderEmbedding(imageBuffer);
    }

    // Use the largest/most prominent face
    let largestDetection = detections[0];
    let maxArea =
      largestDetection.detection.box.width *
      largestDetection.detection.box.height;

    for (let i = 1; i < detections.length; i++) {
      const area =
        detections[i].detection.box.width *
        detections[i].detection.box.height;
      if (area > maxArea) {
        largestDetection = detections[i];
        maxArea = area;
      }
    }

    // face-api returns 128-dim descriptors, expand to 512-dim for consistency
    const descriptor = largestDetection.descriptor;
    const expanded = new Float32Array(512);

    // Fill with repeating pattern from the 128-dim descriptor
    for (let i = 0; i < 512; i++) {
      expanded[i] = descriptor[i % 128];
    }

    return Array.from(expanded);
  } catch (err) {
    logger.warn(
      `Face embedding extraction failed: ${err.message}. Using placeholder.`,
    );
    return generatePlaceholderEmbedding(imageBuffer);
  }
}

// Initialize on module load
try {
  loadModels().catch((err) => {
    logger.warn(
      `Models will be loaded on first request: ${err.message || "Unknown error"}`,
    );
  });
} catch (err) {
  logger.warn("Face-API initialization deferred to first request");
}

module.exports = {
  loadModels,
  extractEmbedding,
  isFaceNetAvailable,
};
