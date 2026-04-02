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

    # Step 1: Find nearest water bodies within radius (existing behaviour)
    cur.execute("""
        SELECT id, name, type,
          ST_Distance(
            geometry::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
          )::float AS distance_meters
        FROM water_bodies
        WHERE name IS NOT NULL
        AND ST_DWithin(
          geometry::geography,
          ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
          %s
        )
        ORDER BY distance_meters ASC
        LIMIT 5
    """, (lng, lat, lng, lat, radius))
    rows = cur.fetchall()

    # Step 2: Find nearest water body whose name appears in a reg_section
    # description — this is self-maintaining as new zones/sections are added.
    # Search within 15km to cover tributaries far from their parent river.
    # Excludes zone-wide general fallback section.
    # Returns the single closest named match so frontend can use it as
    # a parent river fallback if the clicked water has no specific data.
    cur.execute("""
        SELECT wb.id, wb.name, wb.type,
          ST_Distance(
            wb.geometry::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
          )::float AS distance_meters
        FROM water_bodies wb
        WHERE wb.name IS NOT NULL
        AND ST_DWithin(
          wb.geometry::geography,
          ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
          15000
        )
        AND EXISTS (
          SELECT 1 FROM reg_sections rs
          WHERE rs.description ILIKE '%%' || wb.name || '%%'
          AND rs.description NOT ILIKE '%%General Regulations%%'
        )
        ORDER BY distance_meters ASC
        LIMIT 1
    """, (lng, lat, lng, lat))
    parent = cur.fetchone()

    cur.close()
    conn.close()

    # Build results list from primary nearby waters
    results = [
        {
            "id": str(row[0]),
            "name": row[1],
            "type": row[2],
            "distance_meters": row[3],
            "is_parent": False
        }
        for row in rows
    ]

    # Append parent river if found and not already in results
    if parent:
        already_included = any(r["name"] == parent[1] for r in results)
        if not already_included:
            results.append({
                "id": str(parent[0]),
                "name": parent[1],
                "type": parent[2],
                "distance_meters": parent[3],
                "is_parent": True
            })

    return results


@app.get("/health")
def health():
    return {"status": "ok"}
