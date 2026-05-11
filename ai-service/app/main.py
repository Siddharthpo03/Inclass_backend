from __future__ import annotations

from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.models.schemas import FaceImagePayload, RecognizeFaceRequest, RegisterFaceRequest, VerifyFaceRequest
from app.services.face_pipeline import analyze_face, average_embeddings, decode_image, get_face_app
from app.services.vector_store import ensure_schema, fetch_best_match, fetch_user_embedding, upsert_user_embedding

app = FastAPI(title=settings.api_title, version=settings.api_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    ensure_schema()
    get_face_app()
    app.state.face_model_loaded = True


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "inclass-ai-face",
        "model": settings.insightface_model_name,
        "threshold": settings.face_similarity_threshold,
        "face_model_loaded": bool(getattr(app.state, "face_model_loaded", False)),
    }


@app.post("/register-face")
def register_face(payload: RegisterFaceRequest) -> dict[str, Any]:
    images = list(payload.images)
    if payload.image is not None:
        images.append(payload.image)

    if not images:
        raise HTTPException(status_code=400, detail="At least one face image is required.")

    embeddings = []
    instructions = []
    for image_payload in images:
        image = decode_image(image_payload.model_dump())
        face = analyze_face(image)
        if not face.embedding:
            raise HTTPException(status_code=400, detail=face.instruction)
        if face.low_light or face.blurry or face.too_close or face.too_far or not face.center_ok:
            instructions.append(face.instruction)
        embeddings.append(face.embedding)

    averaged = average_embeddings(embeddings)
    upsert_user_embedding(payload.user_id, averaged)

    return {
        "success": True,
        "message": "Face registered successfully.",
        "user_id": payload.user_id,
        "embeddings_used": len(embeddings),
        "instruction": instructions[-1] if instructions else "Face registered successfully.",
        "embedding_length": len(averaged),
    }


@app.post("/recognize-face")
def recognize_face(payload: RecognizeFaceRequest) -> dict[str, Any]:
    image = decode_image(payload.image.model_dump())
    face = analyze_face(image)
    if not face.embedding:
        raise HTTPException(status_code=400, detail=face.instruction)

    match = fetch_best_match(face.embedding)
    if not match:
        raise HTTPException(status_code=404, detail="No enrolled users found.")

    similarity = 1.0 - float(match["cosine_distance"])
    return {
        "success": True,
        "match": similarity >= settings.face_similarity_threshold,
        "confidence": similarity,
        "threshold": settings.face_similarity_threshold,
        "userId": int(match["id"]),
        "name": match["name"],
        "instruction": face.instruction,
        "analysis": face.details,
    }


@app.post("/verify-face")
def verify_face(payload: VerifyFaceRequest) -> dict[str, Any]:
    stored_embedding = fetch_user_embedding(payload.user_id)
    if not stored_embedding:
        raise HTTPException(status_code=404, detail="No face enrollment found for this user.")

    image = decode_image(payload.image.model_dump())
    face = analyze_face(image)
    if not face.embedding:
        raise HTTPException(status_code=400, detail=face.instruction)

    target = np.asarray(stored_embedding, dtype=np.float32)
    candidate = np.asarray(face.embedding, dtype=np.float32)
    similarity = float(np.dot(target, candidate) / (np.linalg.norm(target) * np.linalg.norm(candidate) + 1e-8))
    verified = similarity >= settings.face_similarity_threshold

    return {
        "success": True,
        "verified": verified,
        "confidence": similarity,
        "threshold": settings.face_similarity_threshold,
        "instruction": face.instruction if not verified else "Face verified successfully.",
        "analysis": face.details,
    }
