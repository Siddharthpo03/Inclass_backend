// inclass-backend/services/facenet.js
// FaceNet ONNX model loading and embedding extraction

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const logger = require("../utils/logger");

let sessionPromise = null;
let modelAvailable = false;

function getModelPath() {
  const fromEnv = process.env.FACENET_MODEL_PATH;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return path.join(__dirname, "..", "models", "facenet-512.onnx");
}

// Check once at startup and log a clear warning instead of failing per-request
const MODEL_PATH = getModelPath();
if (fs.existsSync(MODEL_PATH)) {
  modelAvailable = true;
} else {
  logger.warn(
    `FaceNet model not found at ${MODEL_PATH}. ` +
      "Face recognition features are disabled until the model is placed there. " +
      "Download facenet-512.onnx and save it to backend/models/ or set FACENET_MODEL_PATH in .env",
  );
}

function isFaceNetAvailable() {
  return modelAvailable;
}

async function loadModel() {
  if (sessionPromise) {
    return sessionPromise;
  }

  if (!modelAvailable) {
    throw new Error(
      "FaceNet model is not available. Place facenet-512.onnx in backend/models/ or set FACENET_MODEL_PATH.",
    );
  }

  try {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["CPUExecutionProvider"],
    });

    const session = await sessionPromise;
    return session;
  } catch (err) {
    sessionPromise = null;
    logger.error("Model load failed: " + err.message);
    throw new Error(
      `Failed to load FaceNet ONNX model from ${MODEL_PATH}: ${err.message}`,
    );
  }
}

async function preprocessImage(imageBuffer) {
  // Resize and normalize image for FaceNet
  // Assumes model expects 160x160 RGB, values in [-1, 1]
  const size = 160;

  const raw = await sharp(imageBuffer)
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const floatArray = new Float32Array(size * size * 3);

  for (let i = 0; i < raw.length; i++) {
    // Normalize from [0,255] -> [-1,1]
    floatArray[i] = (raw[i] / 255 - 0.5) * 2;
  }

  // Most FaceNet ONNX models use NCHW (1,3,H,W)
  // raw buffer is interleaved RGBRGB..., so reorder to channels-first
  const nchw = new Float32Array(size * size * 3);
  let idx = 0;
  const channelSize = size * size;
  for (let i = 0; i < size * size; i++) {
    const r = floatArray[i * 3];
    const g = floatArray[i * 3 + 1];
    const b = floatArray[i * 3 + 2];
    nchw[i] = r; // R channel
    nchw[channelSize + i] = g; // G channel
    nchw[2 * channelSize + i] = b; // B channel
    idx += 3;
  }

  return {
    tensor: new ort.Tensor("float32", nchw, [1, 3, size, size]),
  };
}

function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / norm;
  }
  return out;
}

/**
 * Extract a 512-dim embedding from a face image buffer.
 * Caller is responsible for ensuring the face is reasonably centered.
 */
async function extractEmbedding(imageBuffer) {
  const session = await loadModel();
  const { tensor } = await preprocessImage(imageBuffer);

  const inputName = session.inputNames[0];
  const feeds = {};
  feeds[inputName] = tensor;

  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const output = results[outputName];

  if (!output || !output.data || output.data.length !== 512) {
    throw new Error(
      `Unexpected FaceNet output shape. Expected 512-dim, got ${output?.data?.length || 0}.`,
    );
  }

  const normalized = l2Normalize(output.data);
  return Array.from(normalized); // plain array for JSON/pgvector
}

module.exports = {
  loadModel,
  extractEmbedding,
  isFaceNetAvailable,
};
