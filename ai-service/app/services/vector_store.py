from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterable, Optional

import numpy as np
import psycopg2
from pgvector.psycopg2 import register_vector
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/inclass")


@contextmanager
def get_connection():
    connection = psycopg2.connect(DATABASE_URL)
    register_vector(connection)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_schema() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_users_embedding_cosine
                ON users USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100)
                """
            )


def normalize_embedding(values: Iterable[float]) -> list[float]:
    vector = np.asarray(list(values), dtype=np.float32)
    norm = np.linalg.norm(vector)
    if norm == 0:
        return vector.tolist()
    return (vector / norm).tolist()


def upsert_user_embedding(user_id: int, embedding: list[float]) -> None:
    normalized = normalize_embedding(embedding)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET embedding = %s, face_enrolled = TRUE WHERE id = %s",
                (normalized, user_id),
            )


def fetch_user_embedding(user_id: int) -> Optional[list[float]]:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, name, embedding FROM users WHERE id = %s LIMIT 1",
                (user_id,),
            )
            row = cursor.fetchone()
    if not row or row["embedding"] is None:
        return None
    return list(row["embedding"])


def fetch_best_match(embedding: list[float]):
    normalized = normalize_embedding(embedding)
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT id, name, embedding <=> %s AS cosine_distance
                FROM users
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s ASC
                LIMIT 1
                """,
                (normalized, normalized),
            )
            row = cursor.fetchone()
    return row
