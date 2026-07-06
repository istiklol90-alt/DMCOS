from database.db import SessionLocal
from app.engines.hotel.models import HotelCategory

# Source: 03_Domain_Model.md #23 "Hotel Category" — the only place these
# 9 values are documented. Do not add/remove values here without updating
# that doc first.
CATEGORY_NAMES = [
    "Luxury",
    "Premium",
    "Family",
    "Adults Only",
    "Budget",
    "Boutique",
    "Business",
    "Resort",
    "Villa",
]


def seed_hotel_categories():
    db = SessionLocal()

    existing_names = {
        row.category_name for row in db.query(HotelCategory.category_name).all()
    }

    created = []
    for name in CATEGORY_NAMES:
        if name in existing_names:
            continue
        db.add(HotelCategory(category_name=name, description=None))
        created.append(name)

    if created:
        db.commit()
        print(f"Created {len(created)} hotel categories: {', '.join(created)}")
    else:
        print("All hotel categories already exist, nothing to do.")

    skipped = [name for name in CATEGORY_NAMES if name not in created]
    if skipped:
        print(f"Already present / skipped: {', '.join(skipped)}")

    db.close()


if __name__ == "__main__":
    seed_hotel_categories()
