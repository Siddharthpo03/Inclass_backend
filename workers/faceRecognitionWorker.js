// inclass-backend/workers/faceRecognitionWorker.js
// Worker thread for FaceNet ONNX embedding generation.
//
// All heavy dependencies (onnxruntime-node, sharp) and model loading run
// exclusively inside this worker so the main server process stays lean,
// starts fast, and keeps the event loop responsive.

const { parentPort, isMainThread } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const logger = require("../utils/logger");

if (isMainThread) {
  throw new Error("faceRecognitionWorker.js must be run as a worker thread");
}

let sessionPromise = null;
let modelAvailable = false;

function getModelPath() {
  const fromEnv = process.env.FACENET_MODEL_PATH;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return path.join(__dirname, "..", "models", "facenet-512.onnx");
}

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
    logger.error("FaceNet worker: model load failed: " + err.message);
    throw new Error(
      `Failed to load FaceNet ONNX model from ${MODEL_PATH}: ${err.message}`,
    );
  }
}

async function preprocessImage(imageBuffer) {
  const size = 160;

  const raw = await sharp(imageBuffer)
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const floatArray = new Float32Array(size * size * 3);
  for (let i = 0; i < raw.length; i++) {
    floatArray[i] = (raw[i] / 255 - 0.5) * 2;
  }

  const nchw = new Float32Array(size * size * 3);
  const channelSize = size * size;
  for (let i = 0; i < size * size; i++) {
    const r = floatArray[i * 3];
    const g = floatArray[i * 3 + 1];
    const b = floatArray[i * 3 + 2];
    nchw[i] = r;
    nchw[channelSize + i] = g;
    nchw[2 * channelSize + i] = b;
  }

  return new ort.Tensor("float32", nchw, [1, 3, size, size]);
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

async function handleExtractEmbedding(id, imageBuffer) {
  const session = await loadModel();
  const tensor = await preprocessImage(imageBuffer);

  const inputName = session.inputNames[0];
  const feeds = { [inputName]: tensor };

  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const output = results[outputName];

  if (!output || !output.data || output.data.length !== 512) {
    throw new Error(
      `Unexpected FaceNet output shape. Expected 512-dim, got ${
        output?.data?.length || 0
      }.`,
    );
  }

  const normalized = l2Normalize(output.data);
  parentPort.postMessage({
    id,
    ok: true,
    embedding: Array.from(normalized),
  });
}

parentPort.on("message", async (message) => {
  const { id, type, payload } = message || {};

  if (!id) {
    return;
  }

  try {
    if (type === "warmup") {
      await loadModel();
      parentPort.postMessage({ id, ok: true });
    } else if (type === "extractEmbedding") {
      if (!payload || !payload.image) {
        throw new Error("Missing image buffer in worker payload");
      }
      await handleExtractEmbedding(id, payload.image);
    } else {
      throw new Error(`Unknown worker message type: ${type}`);
    }
  } catch (err) {
    parentPort.postMessage({
      id,
      ok: false,
      error: err.message || String(err),
    });
  }
});
