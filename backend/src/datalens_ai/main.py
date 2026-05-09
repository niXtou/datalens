from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datalens_ai.api.upload import router as upload_router
from datalens_ai.api.analyse import router as analyse_router

app = FastAPI()


# MIDDLEWARE
# WHY: Allow frontend (localhost:3000 in dev, different domain in prod) to fetch from this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins: ["https://yourdomain.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ROUTERS
app.include_router(upload_router)
app.include_router(analyse_router)


# ENDPOINTS
@app.get("/health")
async def health_check():
    return {"status": "ok"}


# RUN THE APP
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)