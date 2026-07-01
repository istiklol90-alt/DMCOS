from database.db import SessionLocal
from models.user import User
from passlib.context import CryptContext

# Создаем контекст для хеширования
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def create_admin():
    db = SessionLocal()
    
    # Проверить есть ли админ
    existing = db.query(User).filter(User.email == "admin@dmcos.com").first()
    if existing:
        print("⚠️ Admin already exists!")
        print(f"   Email: {existing.email}")
        return
    
    # Создать админа
    admin = User(
        name="System Administrator",
        email="admin@dmcos.com",
        password=get_password_hash("Admin@2026"),
        role="Admin",
        is_active=True
    )
    
    db.add(admin)
    db.commit()
    print("✅ Admin created successfully!")
    print("📝 Email: admin@dmcos.com")
    print("🔑 Password: Admin@2026")
    db.close()

if __name__ == "__main__":
    create_admin()