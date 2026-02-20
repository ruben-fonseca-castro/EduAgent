"""Course and material request/response schemas."""

from typing import Optional
from pydantic import BaseModel


class CourseCreate(BaseModel):
    class_id: str
    title: str
    description: Optional[str] = None


class CourseResponse(BaseModel):
    id: str
    class_id: str
    teacher_id: str
    title: str
    description: Optional[str]
    created_at: str
    materials_count: int = 0

    class Config:
        from_attributes = True


class MaterialResponse(BaseModel):
    id: str
    course_id: str
    filename: str
    file_type: str
    file_size: int
    status: str
    error_message: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class CourseListResponse(BaseModel):
    courses: list[CourseResponse]
    total: int


class MaterialListResponse(BaseModel):
    materials: list[MaterialResponse]
    total: int
