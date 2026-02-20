"""Auth request/response schemas."""

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = "student"  # student | teacher
    display_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    display_name: str
    blue_coins: float
    created_at: str

    class Config:
        from_attributes = True
