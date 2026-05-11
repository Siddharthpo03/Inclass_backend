from typing import Any, List, Optional

from pydantic import BaseModel, Field


class FaceImagePayload(BaseModel):
    filename: Optional[str] = None
    mimetype: Optional[str] = None
    base64: str


class RegisterFaceRequest(BaseModel):
    user_id: int = Field(..., alias="user_id")
    images: List[FaceImagePayload] = Field(default_factory=list)
    image: Optional[FaceImagePayload] = None


class RecognizeFaceRequest(BaseModel):
    image: FaceImagePayload


class VerifyFaceRequest(BaseModel):
    user_id: int = Field(..., alias="user_id")
    image: FaceImagePayload


class FaceAnalysisResult(BaseModel):
    face_count: int
    instruction: str
    centered: bool
    too_close: bool
    too_far: bool
    blurry: bool
    low_light: bool
    bbox: Optional[List[float]] = None
    score: float = 0.0
    confidence: float = 0.0
    embedding: Optional[List[float]] = None
    match: Optional[bool] = None
    matched_user_id: Optional[int] = None
    matched_name: Optional[str] = None
    similarity: Optional[float] = None
    threshold: Optional[float] = None
    details: dict[str, Any] = Field(default_factory=dict)
