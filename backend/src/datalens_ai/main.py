from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# WHY: Allow frontend (localhost:3000 in dev, different domain in prod) to fetch from this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins: ["https://yourdomain.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)