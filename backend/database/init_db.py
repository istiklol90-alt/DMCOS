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
from app.engines.contract.models import (
    Contract,
    ContractMarket,
    ContractSeason,
    ContractAgeCategory,
    ContractMealPlan,
    ContractTransferOption,
    Rate,
    RateSupplement,
    Promotion,
    SpecialOffer,
    SpecialOfferRoomDiscount,
    SpecialOfferMealPlanDiscount,
    SpecialOfferFamilyRule,
    SpecialOfferTransferDiscount,
    BlackoutDate,
    Allotment,
    StopSale,
    CancellationPolicy,
    ReleaseRule,
    MinimumStayRule,
)
from app.engines.booking.models import Booking, Guest
from app.engines.ai_core.models import (
    ContractIngestionJob,
    ExtractedField,
    ModelProviderConfig,
    HumanGateDecision,
)


def init_db():
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")


if __name__ == "__main__":
    init_db()