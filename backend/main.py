from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from api.agent_account import router as agent_account_router
from api.redaction import RedactCostForNonAdmin
# TASK-003: authentication engine fully migrated; backend/auth/ retired.
from app.engines.authentication.api import router as auth_router
# TASK-002: Hotel Engine domain model, schemas, repository, service, and API.
from app.engines.hotel.api import router as hotel_router
# TASK-002: Contract Engine domain model, schemas, repository, service, and API.
from app.engines.contract.api import router as contract_router
# TASK-002: Booking Engine domain model, schemas, repository, service, and API.
from app.engines.booking.api import router as booking_router
# TASK-004: AI Core Engine domain model, schemas, repository, service, and API.
from app.engines.ai_core.api import router as ai_core_router
# TASK-002: Pricing Engine domain model, schemas, repository, service, and API.
from app.engines.pricing.api import router as pricing_router
# TASK-002/003: Finance Engine domain model, schemas, repository, service, and API.
from app.engines.finance.api import router as finance_router

app = FastAPI(title="DMC OS API")

# Security step 3 (2026-10-16): our cost / margin fields are blanked in every
# response to a non-admin (api/redaction.py). Added before CORS so CORS stays outermost.
app.add_middleware(RedactCostForNonAdmin)

# ✅ ПРАВИЛЬНАЯ НАСТРОЙКА CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Main API
app.include_router(router)
# Decision 215: the signed-in agent's own account and client markup.
app.include_router(agent_account_router)

# Authentication API
app.include_router(auth_router)

# Hotel Engine API
app.include_router(hotel_router)

# Contract Engine API
app.include_router(contract_router)

# Booking Engine API
app.include_router(booking_router)

# AI Core Engine API
app.include_router(ai_core_router)

# Pricing Engine API
app.include_router(pricing_router)

# Finance Engine API
app.include_router(finance_router)


@app.get("/")
def root():
    return {
        "status": "OK",
        "system": "DMC OS",
        "version": "0.1",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}