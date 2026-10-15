from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from models.base import Base
from datetime import datetime


class HotelCategory(Base):
    __tablename__ = "hotel_categories"

    id = Column(Integer, primary_key=True, index=True)
    category_name = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)


class Hotel(Base):
    __tablename__ = "hotels"

    id = Column(Integer, primary_key=True, index=True)
    hotel_name = Column(String(200), nullable=False)
    brand = Column(String(100), nullable=True)
    country = Column(String(100), nullable=False)
    region = Column(String(100), nullable=True)
    island = Column(String(100), nullable=True)
    city = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    star_rating = Column(Integer, nullable=True)
    category_id = Column(Integer, ForeignKey("hotel_categories.id"), nullable=True)
    website = Column(String(255), nullable=True)
    email = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    timezone = Column(String(50), nullable=True)
    checkin_time = Column(String(5), nullable=True)
    checkout_time = Column(String(5), nullable=True)
    status = Column(String(20), default="Draft")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HotelImage(Base):
    __tablename__ = "hotel_images"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    image_title = Column(String(200), nullable=True)
    image_path = Column(String(500), nullable=False)
    image_type = Column(String(20), nullable=True)
    display_order = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class HotelFacility(Base):
    __tablename__ = "hotel_facilities"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    facility_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(100), nullable=True)
    display_order = Column(Integer, default=0)


class RoomType(Base):
    __tablename__ = "room_types"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    room_name = Column(String(150), nullable=False)
    room_code = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    room_size = Column(Float, nullable=True)
    bed_type = Column(String(100), nullable=True)
    max_occupancy = Column(Integer, nullable=False)
    # Decision 053: nullable, backfilled as needed per hotel -- not
    # required at creation since most existing room types never needed it.
    # Added specifically to support "N guests per bedroom" special-offer
    # terms (e.g. a free-transfer entitlement sized to a room's bedroom
    # count), a generic field any hotel's room types can populate, not
    # specific to whichever contract first needed it.
    bedroom_count = Column(Integer, nullable=True)
    status = Column(String(20), default="Draft")
    created_at = Column(DateTime, default=datetime.utcnow)


class RoomImage(Base):
    __tablename__ = "room_images"

    id = Column(Integer, primary_key=True, index=True)
    room_type_id = Column(Integer, ForeignKey("room_types.id"), nullable=False)
    image_path = Column(String(500), nullable=False)
    title = Column(String(200), nullable=True)
    display_order = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class RoomOccupancyOption(Base):
    __tablename__ = "room_occupancy_options"

    id = Column(Integer, primary_key=True, index=True)
    room_type_id = Column(Integer, ForeignKey("room_types.id"), nullable=False)
    adults = Column(Integer, nullable=False, default=1)
    children = Column(Integer, nullable=False, default=0)
    infants = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True)
    # Decision 211 (bedding): how this party actually sleeps, so an agent can
    # see "1 king bed + sofa bed for 2 children" instead of guessing from
    # "2 adults + 2 children". `beds` is a JSON list of {type, count,
    # for_children} (schemas.BedItem) -- structured rather than free text so
    # the agent panel can say it in Russian or English. `bedding_note` is
    # free text for whatever the list cannot say. Both nullable: NULL means
    # "not entered", never "no beds". Added by raw ALTER TABLE.
    beds = Column(Text, nullable=True)
    bedding_note = Column(Text, nullable=True)


class RoomAvailability(Base):
    __tablename__ = "room_availability"
    __table_args__ = (
        UniqueConstraint("room_type_id", "date", name="uq_room_availability_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    room_type_id = Column(Integer, ForeignKey("room_types.id"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="free_sale")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
