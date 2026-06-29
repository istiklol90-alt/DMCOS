from database.db import engine
from models.base import Base
from models.user import User
from models.agent import AgentRegistration


def init_db():
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")


if __name__ == "__main__":
    init_db()