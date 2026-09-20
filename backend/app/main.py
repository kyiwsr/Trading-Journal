from fastapi import FastAPI

app = FastAPI(title="Trading Journal API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
