// inclass-backend/utils/faceRecognition.js
// Face recognition utility using face-api.js

const fs = require("fs").promises;
const path = require("path");

// Try to load face-api and TensorFlow, but handle gracefully if not available
let faceapi = null;
let Canvas = null;
let Image = null;
let ImageData = null;

// Use a function to safely require modules
function safeRequire(moduleName) {
  try {
    return require(moduleName);
  } catch (error) {
    return null;
  }
}

// Try to load TensorFlow.js (may fail on Windows without build tools)
const tfjsNode = safeRequire("@tensorflow/tfjs-node");
if (tfjsNode) {
  // TensorFlow loaded successfully, try to load face-api
  faceapi = safeRequire("@vladmandic/face-api");
  
  if (faceapi) {
    // Try to load canvas
    const canvasModule = safeRequire("canvas");
    if (canvasModule) {
      Canvas = canvasModule.Canvas;
      Image = canvasModule.Image;
      ImageData = canvasModule.ImageData;
      // Configure face-api to use canvas
      try {
        faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
      } catch (patchError) {
        console.warn("⚠️  Failed to configure face-api with canvas:", patchError.message);
      }
    } else {
      console.warn("⚠️  Canvas module not available. Face recognition will use fallback mode.");
    }
  }
} else {
  console.warn("⚠️  TensorFlow.js native addon not available. Face recognition will use fallback mode.");
  console.warn("   To enable full face recognition, run: npm rebuild @tensorflow/tfjs-node --build-addon-from-source");
  console.warn("   (Requires Visual Studio build tools on Windows)");
  console.warn("   Server will continue without face recognition features.");
}

let modelsLoaded = false;
const MODEL_PATH = path.join(__dirname, "../models"); // Models will be stored here
const THRESHOLD = 0.6; // Face match threshold (0.0 to 1.0, lower = stricter)

/**
 * Load face-api models (call this once at startup)
 */
async function loadModels() {
  if (modelsLoaded) {
    return;
  }

  // If face-api is not available, skip model loading
  if (!faceapi) {
    console.warn("⚠️  Face recognition unavailable (TensorFlow.js not loaded). Using fallback mode.");
    modelsLoaded = false;
    return;
  }

  try {
    // Create models directory if it doesn't exist
    await fs.mkdir(MODEL_PATH, { recursive: true });

    // Load models (you'll need to download these models separately)
    // For now, we'll use a simplified approach
    console.log("⚠️  Face recognition models need to be downloaded.");
    console.log("📥 Download models from: https://github.com/vladmandic/face-api/tree/master/model");
    console.log("📁 Place them in: backend/models/");
    
    // Try to load models if they exist
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
      modelsLoaded = true;
      console.log("✅ Face recognition models loaded successfully");
    } catch (modelError) {
      console.warn("⚠️  Models not found. Face recognition will use fallback mode.");
      console.warn("   To enable full face recognition, download and place models in:", MODEL_PATH);
      modelsLoaded = false;
    }
  } catch (error) {
    console.error("❌ Error loading face recognition models:", error.message);
    modelsLoaded = false;
  }
}

/**
 * Convert base64 image to buffer
 */
function base64ToBuffer(base64String) {
  // Remove data URL prefix if present
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

/**
 * Detect and extract face descriptor from image
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<Float32Array|null>} - Face descriptor or null if no face detected
 */
async function extractFaceDescriptor(imageBase64) {
  try {
    if (!faceapi || !modelsLoaded) {
      throw new Error("Face recognition unavailable. TensorFlow.js or models not loaded.");
    }

    const imageBuffer = base64ToBuffer(imageBase64);
    const img = await faceapi.bufferToImage(imageBuffer);

    // Detect faces with landmarks
    const detections = await faceapi
      .detectAllFaces(img)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) {
      return null; // No face detected
    }

    if (detections.length > 1) {
      throw new Error("Multiple faces detected. Please provide an image with only one face.");
    }

    // Return the face descriptor (128-dimensional vector)
    return detections[0].descriptor;
  } catch (error) {
    console.error("Error extracting face descriptor:", error);
    throw error;
  }
}

/**
 * Compare two face descriptors and return similarity score
 * @param {Float32Array} descriptor1 - First face descriptor
 * @param {Float32Array} descriptor2 - Second face descriptor
 * @returns {number} - Similarity score (0.0 to 1.0, higher = more similar)
 */
function compareFaceDescriptors(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2) {
    return 0;
  }

  // Calculate Euclidean distance
  let distance = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    distance += diff * diff;
  }
  distance = Math.sqrt(distance);

  // Convert distance to similarity score (0.0 to 1.0)
  // Lower distance = higher similarity
  // Using a sigmoid-like function to convert distance to similarity
  const similarity = 1 / (1 + distance);
  
  return similarity;
}

/**
 * Verify if a face matches a stored face descriptor
 * @param {string} imageBase64 - Base64 encoded image to verify
 * @param {Float32Array} storedDescriptor - Stored face descriptor from database
 * @returns {Promise<{match: boolean, score: number}>} - Match result and similarity score
 */
async function verifyFace(imageBase64, storedDescriptor) {
  try {
    // Extract descriptor from the new image
    const extractedDescriptor = await extractFaceDescriptor(imageBase64);

    if (!extractedDescriptor) {
      return { match: false, score: 0, error: "No face detected in the image" };
    }

    // Convert stored descriptor from JSON array back to Float32Array
    const storedDescriptorArray = new Float32Array(storedDescriptor);

    // Compare descriptors
    const similarityScore = compareFaceDescriptors(extractedDescriptor, storedDescriptorArray);

    // Check if similarity score meets threshold
    const match = similarityScore >= THRESHOLD;

    return {
      match,
      score: similarityScore,
      threshold: THRESHOLD,
    };
  } catch (error) {
    console.error("Error verifying face:", error);
    return {
      match: false,
      score: 0,
      error: error.message,
    };
  }
}

/**
 * Simple face detection (without recognition) - fallback when models aren't loaded
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<boolean>} - True if a face is detected
 */
async function detectFaceSimple(imageBase64) {
  // This is a placeholder - in production, you'd use a simpler detection method
  // For now, we'll assume a face is present if the image is valid
  try {
    const imageBuffer = base64ToBuffer(imageBase64);
    // Basic validation: check if it's a valid image buffer
    return imageBuffer.length > 0;
  } catch (error) {
    return false;
  }
}

module.exports = {
  loadModels,
  extractFaceDescriptor,
  compareFaceDescriptors,
  verifyFace,
  detectFaceSimple,
  THRESHOLD,
  isModelsLoaded: () => modelsLoaded,
};

