from database.db import engine
from models.base import Base
from models.user import User
from models.agent import AgentRegistration

def init_db():
    print("🔄 Создание таблиц...")
    Base.metadata.create_all(bind=engine)
    print("✅ Таблицы созданы!")
    print("📋 Список таблиц:")
    from sqlalchemy import inspect
    inspector = inspect(engine)
    for table in inspector.get_table_names():
        print(f"   - {table}")

if __name__ == "__main__":
    init_db()