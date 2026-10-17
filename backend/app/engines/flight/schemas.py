from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class LegCreate(BaseModel):
    direction: str
    airline: Optional[str] = None
    flight_number: str = Field(..., min_length=2, max_length=20)
    origin: str = Field(..., min_length=2, max_length=100)
    destination: str = Field(..., min_length=2, max_length=100)
    destination_country: str = Field(..., min_length=2, max_length=100)
    departure_time: str
    arrival_time: str
    arrival_day_offset: int = Field(0, ge=0, le=2)
    currency: str


class LegUpdate(BaseModel):
    direction: Optional[str] = None
    airline: Optional[str] = None
    flight_number: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    destination_country: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    arrival_day_offset: Optional[int] = Field(None, ge=0, le=2)
    currency: Optional[str] = None
    active: Optional[bool] = None


class LegResponse(BaseModel):
    id: int
    direction: str
    airline: Optional[str] = None
    flight_number: str
    origin: str
    destination: str
    destination_country: str
    departure_time: str
    arrival_time: str
    arrival_day_offset: int
    currency: str
    active: bool
    departures: int = 0
    seats_sold: int = 0
    first_date: Optional[date] = None
    last_date: Optional[date] = None

    class Config:
        from_attributes = True


class CabinPlan(BaseModel):
    cabin: str
    seats: int
    cost: float
    price: float
    reason: Optional[str] = None


class ScheduleRequest(BaseModel):
    date_from: date
    date_to: date
    weekdays: list[int]
    cabins: list[CabinPlan]


class ScheduleResponse(BaseModel):
    created: int
    updated: int
    kept_manual_price: int
    seats_kept_at_sold: list[str] = []


class DepartureUpdate(BaseModel):
    price_per_seat: Optional[float] = None
    cost_per_seat: Optional[float] = None
    seats_total: Optional[int] = Field(None, ge=0)
    active: Optional[bool] = None
    reason: Optional[str] = None


class BulkPriceRequest(BaseModel):
    departure_ids: list[int]
    price: Optional[float] = None
    percent: Optional[float] = None
    reason: Optional[str] = None


class GridRow(BaseModel):
    departure_id: int
    date: date
    cabin: str
    leg_id: int
    direction: str
    flight_number: str
    route: str
    departure_time: str
    arrival_time: str
    arrival_day_offset: int
    currency: str
    seats_total: int
    seats_sold: int
    seats_free: int
    cost_per_seat: float
    price_per_seat: float
    standard_price: float
    active: bool
    below_cost: bool


class PriceChangeResponse(BaseModel):
    id: int
    old_price: Optional[float] = None
    new_price: Optional[float] = None
    old_cost: Optional[float] = None
    new_cost: Optional[float] = None
    old_seats: Optional[int] = None
    new_seats: Optional[int] = None
    reason: Optional[str] = None
    changed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
