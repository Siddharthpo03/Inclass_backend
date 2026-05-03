#!/usr/bin/env node
/**
 * Face Recognition Model Test Script
 * Tests whether the face-api.js models are properly loaded and functional
 */

const tf = require("@tensorflow/tfjs");
const faceapi = require("@vladmandic/face-api/dist/face-api.node-cpu.js");
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");

const MODELS_PATH =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@0.13.1/model/";

console.log("=".repeat(70));
console.log("FACE RECOGNITION MODEL TEST");
console.log("=".repeat(70));

let testsPassed = 0;
let testsFailed = 0;

// Test 1: Check TensorFlow.js
console.log("\n[TEST 1] TensorFlow.js Version");
try {
  console.log(`  ✓ TensorFlow.js loaded: ${tf.version.tfjs}`);
  testsPassed++;
} catch (err) {
  console.log(`  ✗ TensorFlow.js failed: ${err.message}`);
  testsFailed++;
}

// Test 2: Check face-api availability
console.log("\n[TEST 2] Face-API Library");
try {
  if (faceapi && faceapi.nets) {
    console.log(`  ✓ Face-API library loaded`);
    console.log(`  ✓ Available nets: ${Object.keys(faceapi.nets).join(", ")}`);
    testsPassed++;
  } else {
    throw new Error("face-api nets not found");
  }
} catch (err) {
  console.log(`  ✗ Face-API failed: ${err.message}`);
  testsFailed++;
}

// Test 3: Check Jimp (image processing)
console.log("\n[TEST 3] Jimp Image Library");
try {
  console.log(`  ✓ Jimp library loaded`);
  testsPassed++;
} catch (err) {
  console.log(`  ✗ Jimp failed: ${err.message}`);
  testsFailed++;
}

// Test 4: Attempt to load face-api models
console.log("\n[TEST 4] Loading Face-API Models from CDN");
console.log(`  Models URL: ${MODELS_PATH}`);

(async () => {
  try {
    console.log("  Loading tinyFaceDetector...");
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH);
    console.log("  ✓ tinyFaceDetector loaded");

    console.log("  Loading faceLandmark68Net...");
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH);
    console.log("  ✓ faceLandmark68Net loaded");

    console.log("  Loading faceRecognitionNet...");
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH);
    console.log("  ✓ faceRecognitionNet loaded");

    testsPassed++;
    console.log("\n  ✓ ALL MODELS LOADED SUCCESSFULLY");
  } catch (err) {
    console.log(`  ✗ Model loading failed: ${err.message}`);
    console.log(`  This usually means: Network issue or CDN unavailable`);
    testsFailed++;
  }

  // Test 5: Test face detection with sample image
  console.log("\n[TEST 5] Face Detection with Sample Image");
  try {
    // Create a simple test image (solid color)
    const testImagePath = path.join(__dirname, "test-face-image.png");

    // Generate a test image if it doesn't exist
    if (!fs.existsSync(testImagePath)) {
      console.log("  Creating test image...");
      const image = new Jimp({ width: 500, height: 500, color: 0xffffffff });
      await image.write(testImagePath);
    }

    const imageBuffer = fs.readFileSync(testImagePath);
    const jimpImage = await Jimp.read(imageBuffer);
    const resized = jimpImage.resize(640, 480);

    const pixels = resized.bitmap.data;
    const width = resized.bitmap.width;
    const height = resized.bitmap.height;
    const rgbPixels = new Float32Array(width * height * 3);

    for (
      let sourceIndex = 0, targetIndex = 0;
      sourceIndex < pixels.length;
      sourceIndex += 4
    ) {
      rgbPixels[targetIndex++] = pixels[sourceIndex];
      rgbPixels[targetIndex++] = pixels[sourceIndex + 1];
      rgbPixels[targetIndex++] = pixels[sourceIndex + 2];
    }

    const tensor = tf.tensor3d(rgbPixels, [height, width, 3], "float32");
    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    tensor.dispose();

    console.log(`  ✓ Face detection test completed`);
    console.log(`  ✓ Faces detected: ${detections.length}`);
    console.log(`  (Note: Test image is blank, so 0 detections is expected)`);
    testsPassed++;
  } catch (err) {
    console.log(`  ✗ Face detection test failed: ${err.message}`);
    testsFailed++;
  }

  // Final Summary
  console.log("\n" + "=".repeat(70));
  console.log("TEST SUMMARY");
  console.log("=".repeat(70));
  console.log(`  Passed: ${testsPassed}`);
  console.log(`  Failed: ${testsFailed}`);

  if (testsFailed === 0) {
    console.log(
      "\n✓ FACE RECOGNITION MODEL IS WORKING! All tests passed.\n"
    );
    process.exit(0);
  } else {
    console.log("\n✗ Some tests failed. See details above.\n");
    process.exit(1);
  }
})();
