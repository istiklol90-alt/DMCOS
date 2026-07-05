from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date


HotelStatus = Literal["Draft", "Active", "Inactive", "Suspended", "Archived"]
RoomAvailabilityStatus = Literal["free_sale", "on_request", "closed"]


# ---------------------------------------------------------------------------
# Hotel Category
# ---------------------------------------------------------------------------


class HotelCategoryCreate(BaseModel):
    category_name: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = None


class HotelCategoryResponse(BaseModel):
    id: int
    category_name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Hotel
# ---------------------------------------------------------------------------


class HotelCreate(BaseModel):
    hotel_name: str = Field(..., min_length=2, max_length=200)
    brand: Optional[str] = None
    country: str = Field(..., min_length=2, max_length=100)
    region: Optional[str] = None
    island: Optional[str] = None
    city: str = Field(..., min_length=2, max_length=100)
    address: Optional[str] = None
    star_rating: Optional[int] = Field(None, ge=1, le=5)
    category_id: Optional[int] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    checkin_time: Optional[str] = Field(None, max_length=5)
    checkout_time: Optional[str] = Field(None, max_length=5)
    description: Optional[str] = None


class HotelUpdate(BaseModel):
    hotel_name: Optional[str] = Field(None, min_length=2, max_length=200)
    brand: Optional[str] = None
    country: Optional[str] = Field(None, min_length=2, max_length=100)
    region: Optional[str] = None
    island: Optional[str] = None
    city: Optional[str] = Field(None, min_length=2, max_length=100)
    address: Optional[str] = None
    star_rating: Optional[int] = Field(None, ge=1, le=5)
    category_id: Optional[int] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    checkin_time: Optional[str] = Field(None, max_length=5)
    checkout_time: Optional[str] = Field(None, max_length=5)
    status: Optional[HotelStatus] = None
    description: Optional[str] = None


class HotelResponse(BaseModel):
    id: int
    hotel_name: str
    brand: Optional[str] = None
    country: str
    region: Optional[str] = None
    island: Optional[str] = None
    city: str
    address: Optional[str] = None
    star_rating: Optional[int] = None
    category_id: Optional[int] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    checkin_time: Optional[str] = None
    checkout_time: Optional[str] = None
    status: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Hotel Image
# ---------------------------------------------------------------------------


class HotelImageCreate(BaseModel):
    hotel_id: int
    image_title: Optional[str] = None
    image_path: str = Field(..., min_length=1, max_length=500)
    image_type: Optional[str] = None
    display_order: int = 0


class HotelImageResponse(BaseModel):
    id: int
    hotel_id: int
    image_title: Optional[str] = None
    image_path: str
    image_type: Optional[str] = None
    display_order: int = 0
    uploaded_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Hotel Facility
# ---------------------------------------------------------------------------


class HotelFacilityCreate(BaseModel):
    hotel_id: int
    facility_name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    display_order: int = 0


class HotelFacilityResponse(BaseModel):
    id: int
    hotel_id: int
    facility_name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    display_order: int = 0

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Room Type
# ---------------------------------------------------------------------------


class RoomTypeCreate(BaseModel):
    hotel_id: int
    room_name: str = Field(..., min_length=2, max_length=150)
    room_code: Optional[str] = None
    description: Optional[str] = None
    room_size: Optional[float] = Field(None, gt=0)
    bed_type: Optional[str] = None
    max_occupancy: int = Field(..., ge=1)


class RoomTypeUpdate(BaseModel):
    room_name: Optional[str] = Field(None, min_length=2, max_length=150)
    room_code: Optional[str] = None
    description: Optional[str] = None
    room_size: Optional[float] = Field(None, gt=0)
    bed_type: Optional[str] = None
    max_occupancy: Optional[int] = Field(None, ge=1)
    status: Optional[HotelStatus] = None


class RoomTypeResponse(BaseModel):
    id: int
    hotel_id: int
    room_name: str
    room_code: Optional[str] = None
    description: Optional[str] = None
    room_size: Optional[float] = None
    bed_type: Optional[str] = None
    max_occupancy: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Room Image
# ---------------------------------------------------------------------------


class RoomImageCreate(BaseModel):
    room_type_id: int
    image_path: str = Field(..., min_length=1, max_length=500)
    title: Optional[str] = None
    display_order: int = 0


class RoomImageResponse(BaseModel):
    id: int
    room_type_id: int
    image_path: str
    title: Optional[str] = None
    display_order: int = 0
    uploaded_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Room Occupancy Option
# ---------------------------------------------------------------------------
# Note: cross-field validation that adults + children stays within the
# parent room type's max_occupancy happens in validators.py (needs the
# RoomType row, not just this payload) — not enforced here.


class RoomOccupancyOptionCreate(BaseModel):
    room_type_id: int
    adults: int = Field(..., ge=1)
    children: int = Field(0, ge=0)
    infants: int = Field(0, ge=0)
    is_active: bool = True


class RoomOccupancyOptionResponse(BaseModel):
    id: int
    room_type_id: int
    adults: int
    children: int
    infants: int
    is_active: bool

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Room Availability
# ---------------------------------------------------------------------------


class RoomAvailabilityCreate(BaseModel):
    room_type_id: int
    date: date
    status: RoomAvailabilityStatus = "free_sale"


class RoomAvailabilityUpdate(BaseModel):
    status: RoomAvailabilityStatus


class RoomAvailabilityResponse(BaseModel):
    id: int
    room_type_id: int
    date: date
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True
