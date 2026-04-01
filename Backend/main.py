from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_URL = os.getenv("SUPABASE_DB_URL")

@app.get("/nearest-water")
def nearest_water(lat: float, lng: float, radius: float = 2000):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        select id, name, type,
          ST_Distance(
            geometry::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
          )::float as distance_meters
        from water_bodies
        where name is not null
        and ST_DWithin(
          geometry::geography,
          ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
          %s
        )
        order by distance_meters asc
        limit 5
    """, (lng, lat, lng, lat, radius))
    
    rows = cur.fetchall()
    cur.close()
    conn.close()
    
    return [
        {
            "id": str(row[0]),
            "name": row[1],
            "type": row[2],
            "distance_meters": row[3]
        }
        for row in rows
    ]

@app.get("/health")
def health():
    return {"status": "ok"}
```

Also create `backend/requirements.txt`:
```
fastapi
uvicorn
psycopg2-binary
python-dotenv
```

And create `backend/.env` with your Supabase DB URL:
```
SUPABASE_DB_URL=postgresql://postgres:yourpassword@db.qqgwcbbjpwoltzxptkdj.supabase.co:5432/postgres