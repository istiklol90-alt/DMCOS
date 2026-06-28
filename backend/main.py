from fastapi import FastAPI
from api.routes import router

app = FastAPI(title="DMC OS API")

app.include_router(router)