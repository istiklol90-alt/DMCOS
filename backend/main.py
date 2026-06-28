from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "DMC OS is running!"}
    from fastapi import FastAPI

app = FastAPI(title="DMC OS API")


@app.get("/")
def root():
    return {
        "status": "running",
        "project": "DMC OS"
    }
