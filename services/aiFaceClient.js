const axios = /** @type {import("axios").AxiosStatic} */ (
  require("axios").default || require("axios")
);

const AI_FACE_SERVICE_URL =
  process.env.AI_FACE_SERVICE_URL || "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = Number(process.env.AI_FACE_TIMEOUT_MS || 15000);

const client = axios.create({
  baseURL: AI_FACE_SERVICE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

const stripDataUrl = (value) =>
  String(value || "").replace(/^data:image\/\w+;base64,/, "");

const toBase64Payload = (image) => {
  if (!image) {
    return null;
  }

  if (typeof image === "string") {
    return {
      base64: stripDataUrl(image),
    };
  }

  if (typeof image === "object" && image.base64) {
    return {
      filename: image.filename,
      mimetype: image.mimetype,
      base64: stripDataUrl(image.base64),
    };
  }

  if (!image.buffer) {
    return null;
  }

  return {
    filename: image.originalname,
    mimetype: image.mimetype,
    base64: image.buffer.toString("base64"),
  };
};

const normalizeImages = (files = []) =>
  files.map(toBase64Payload).filter(Boolean);

async function registerFace({ userId, images = [], image = null }) {
  const payload = {
    user_id: userId,
    images: normalizeImages(images),
    image: image ? toBase64Payload(image) : null,
  };

  const response = await client.post("/register-face", payload);
  return response.data;
}

async function recognizeFace({ image }) {
  const payload = {
    image: toBase64Payload(image),
  };

  const response = await client.post("/recognize-face", payload);
  return response.data;
}

async function verifyFace({ userId, image }) {
  const payload = {
    user_id: userId,
    image: toBase64Payload(image),
  };

  const response = await client.post("/verify-face", payload);
  return response.data;
}

async function healthCheck() {
  const response = await client.get("/health");
  return response.data;
}

module.exports = {
  AI_FACE_SERVICE_URL,
  registerFace,
  recognizeFace,
  verifyFace,
  healthCheck,
};
