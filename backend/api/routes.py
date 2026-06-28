from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {
        "status": "OK",
        "system": "DMC OS",
        "version": "0.1"
    }