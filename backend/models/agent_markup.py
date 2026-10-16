from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String

from models.base import Base


class AgentMarkup(Base):
    """An agent's OWN markup, shown on top of the price they pay us when
    they present prices to their clients (Decision 215).

    Display only: bookings, invoices and every figure the company charges
    are untouched -- the agent still pays our price, the markup is theirs.
    One row per (agent, destination country); country NULL is the agent's
    default for every destination without its own row. Cross-engine
    reference (`user_id`) is a plain Integer, same convention as every
    engine.
    """

    __tablename__ = "agent_markups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    country = Column(String(100), nullable=True)
    percent = Column(Float, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
