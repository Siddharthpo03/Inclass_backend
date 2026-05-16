import os
from pydantic import BaseModel

class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/inclass")
    face_similarity_threshold: float = float(os.getenv("FACE_SIMILARITY_THRESHOLD", "0.35"))
    face_match_margin: float = 0.08
    api_title: str = "InClass AI Face Service"
    api_version: str = "1.0.0"
    insightface_model_name: str = "buffalo_l"
    insightface_providers: str = "CPUExecutionProvider"
    min_face_size_ratio: float = float(os.getenv("MIN_FACE_SIZE_RATIO", "0.03"))
    max_face_size_ratio: float = 0.55
    min_brightness: float = float(os.getenv("MIN_BRIGHTNESS", "20.0"))
    min_blur: float = float(os.getenv("MIN_BLUR", "50.0"))

settings = Settings()