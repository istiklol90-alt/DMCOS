from fastapi import FastAPI
from api.routes import router

app = FastAPI(title="DMC OS API")

app.include_router(router)


@app.get("/")
def root():
    return {
        "status": "running",
        "project": "DMC OS"
    }
