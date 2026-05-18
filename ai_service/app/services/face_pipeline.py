from __future__ import annotations

import base64
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from typing import Any, Optional

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from app.core.config import settings


@dataclass
class FaceCandidate:
    embedding: list[float]
    bbox: list[float]
    center_ok: bool
    too_close: bool
    too_far: bool
    blurry: bool
    low_light: bool
    instruction: str
    confidence: float
    score: float
    face_count: int
    details: dict[str, Any]


@lru_cache(maxsize=1)
def get_face_app() -> FaceAnalysis:
    providers = [provider.strip() for provider in settings.insightface_providers.split(",") if provider.strip()]
    face_app = FaceAnalysis(name=settings.insightface_model_name, providers=providers)
    face_app.prepare(ctx_id=0, det_size=(640, 640))
    return face_app


def decode_image(payload: dict[str, Any]) -> np.ndarray:
    base64_value = payload.get("base64") if payload else None
    if not base64_value:
        raise ValueError("Image payload is required")

    binary = base64.b64decode(base64_value)
    raw_array = np.frombuffer(binary, dtype=np.uint8)
    image = cv2.imdecode(raw_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode image")
    return image


def image_stats(image: np.ndarray) -> tuple[float, float]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return brightness, blur


def analyze_face(image: np.ndarray) -> FaceCandidate:
    face_app = get_face_app()
    faces = face_app.get(image)
    face_count = len(faces)
    brightness, blur = image_stats(image)

    if face_count == 0:
        return FaceCandidate(
            embedding=[],
            bbox=[],
            center_ok=False,
            too_close=False,
            too_far=False,
            blurry=blur < settings.min_blur,
            low_light=brightness < settings.min_brightness,
            instruction="No face detected. Center your face in the circle.",
            confidence=0.0,
            score=0.0,
            face_count=0,
            details={"brightness": brightness, "blur": blur},
        )

    if face_count > 1:
        best_face = max(faces, key=lambda face: float(face.bbox[2] * face.bbox[3]))
        return FaceCandidate(
            embedding=best_face.embedding.astype(np.float32).tolist(),
            bbox=[float(x) for x in best_face.bbox],
            center_ok=False,
            too_close=False,
            too_far=False,
            blurry=blur < settings.min_blur,
            low_light=brightness < settings.min_brightness,
            instruction="Only one face allowed. Ask everyone else to step out of frame.",
            confidence=float(best_face.det_score),
            score=float(best_face.det_score),
            face_count=face_count,
            details={"brightness": brightness, "blur": blur},
        )

    face = faces[0]
    x1, y1, x2, y2 = [float(v) for v in face.bbox]
    width = float(image.shape[1])
    height = float(image.shape[0])
    face_width = x2 - x1
    face_height = y2 - y1
    area_ratio = (face_width * face_height) / float(width * height)
    center_x = (x1 + x2) / 2.0
    center_y = (y1 + y2) / 2.0
    offset_x = abs(center_x - (width / 2.0)) / width
    offset_y = abs(center_y - (height / 2.0)) / height

    too_close = area_ratio > settings.max_face_size_ratio
    too_far = area_ratio < settings.min_face_size_ratio
    center_ok = offset_x <= 0.35 and offset_y <= 0.35
    blurry = blur < settings.min_blur
    low_light = brightness < settings.min_brightness

    instruction = "Hold still and capture."
    if low_light:
        instruction = "Lighting too low. Move to a brighter spot."
    elif blurry:
        instruction = "Image blurry. Hold still and retry."
    elif too_close:
        instruction = "Move farther away from the camera."
    elif too_far:
        instruction = "Move closer to the camera."
    elif not center_ok:
        if offset_x > 0.12:
            instruction = "Face not centered. Align your face with the circle."
        else:
            instruction = "Adjust your face vertically to stay inside the circle."

    return FaceCandidate(
        embedding=face.embedding.astype(np.float32).tolist(),
        bbox=[x1, y1, x2, y2],
        center_ok=center_ok,
        too_close=too_close,
        too_far=too_far,
        blurry=blurry,
        low_light=low_light,
        instruction=instruction,
        confidence=float(face.det_score),
        score=float(face.det_score),
        face_count=face_count,
        details={
            "brightness": brightness,
            "blur": blur,
            "area_ratio": area_ratio,
            "offset_x": offset_x,
            "offset_y": offset_y,
        },
    )


def average_embeddings(embeddings: list[list[float]]) -> list[float]:
    if not embeddings:
        raise ValueError("At least one embedding is required")

    matrix = np.asarray(embeddings, dtype=np.float32)
    mean = np.mean(matrix, axis=0)
    norm = np.linalg.norm(mean)
    if norm == 0:
        return mean.tolist()
    return (mean / norm).tolist()
