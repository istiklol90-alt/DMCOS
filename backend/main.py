from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from auth.auth import router as auth_router

app = FastAPI(title="DMC OS API")

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

# Authentication API
app.include_router(auth_router)


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