"""Class request/response schemas."""

from pydantic import BaseModel


class ClassCreate(BaseModel):
    name: str


class ClassJoin(BaseModel):
    invite_code: str


class ClassResponse(BaseModel):
    id: str
    name: str
    teacher_id: str
    invite_code: str
    created_at: str

    class Config:
        from_attributes = True


class ClassListResponse(BaseModel):
    classes: list[ClassResponse]
