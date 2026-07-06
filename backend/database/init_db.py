from database.db import engine
from models.base import Base
from models.user import User
from models.agent import AgentRegistration
from app.engines.hotel.models import (
    HotelCategory,
    Hotel,
    HotelImage,
    HotelFacility,
    RoomType,
    RoomImage,
    RoomOccupancyOption,
    RoomAvailability,
)


def init_db():
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")


if __name__ == "__main__":
    init_db()