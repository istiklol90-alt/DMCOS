from database.db import engine
from models.base import Base
from models.agent import Agent

def init_db():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()