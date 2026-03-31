import geopandas as gpd
import psycopg2
import os
from dotenv import load_dotenv
from shapely.geometry import mapping, shape
import shapely

load_dotenv(r'C:\Users\cstru\Desktop\BlueLine\.env')

GPKG_PATH = r'C:\Users\cstru\Desktop\BlueLine\NHD_H_Oregon_State_GPKG\NHD_H_Oregon_State_GPKG.gpkg'
DB_URL = os.getenv('SUPABASE_DB_URL')

def get_connection():
    return psycopg2.connect(DB_URL)

def strip_z(geom):
    return shapely.force_2d(geom)

def import_flowlines():
    print("Reading named flowlines...")
    gdf = gpd.read_file(GPKG_PATH, layer='NHDFlowline', engine='pyogrio')
    named = gdf[gdf['gnis_name'].notna() & (gdf['gnis_name'] != '')].copy()
    named = named.to_crs(epsg=4326)
    print(f"Importing {len(named)} named flowlines...")

    conn = get_connection()
    cur = conn.cursor()
    batch = []
    count = 0

    for _, row in named.iterrows():
        geom = row.geometry
        if geom is None:
            continue
        name = str(row['gnis_name']).strip()
        ftype = str(row['ftype']) if row['ftype'] else None
        water_type = 'river'
        if ftype in ['420', '428', '566']:
            water_type = 'creek'
        elif ftype in ['336', '334']:
            water_type = 'canal'
        geom_2d = strip_z(geom)
        geom_wkt = geom_2d.wkt
        batch.append((name, water_type, geom_wkt))

        if len(batch) >= 500:
            cur.executemany("""
                INSERT INTO water_bodies (name, type, geometry)
                VALUES (%s, %s::text, ST_GeomFromText(%s, 4326))
                ON CONFLICT DO NOTHING
            """, batch)
            conn.commit()
            count += len(batch)
            batch = []
            print(f"  Imported {count} flowlines...")

    if batch:
        cur.executemany("""
            INSERT INTO water_bodies (name, type, geometry)
            VALUES (%s, %s::text, ST_GeomFromText(%s, 4326))
            ON CONFLICT DO NOTHING
        """, batch)
        conn.commit()
        count += len(batch)

    print(f"Flowlines complete: {count} imported")
    cur.close()
    conn.close()

def import_waterbodies():
    print("Reading named water bodies...")
    wb = gpd.read_file(GPKG_PATH, layer='NHDWaterbody', engine='pyogrio')
    named = wb[wb['gnis_name'].notna() & (wb['gnis_name'] != '')].copy()
    named = named.to_crs(epsg=4326)
    print(f"Importing {len(named)} named water bodies...")

    conn = get_connection()
    cur = conn.cursor()
    batch = []
    count = 0

    for _, row in named.iterrows():
        geom = row.geometry
        if geom is None:
            continue
        name = str(row['gnis_name']).strip()
        ftype = str(row['ftype']) if row['ftype'] else None
        water_type = 'lake'
        if ftype == '361':
            water_type = 'pond'
        elif ftype == '378':
            water_type = 'reservoir'
        geom_2d = strip_z(geom)
        geom_wkt = geom_2d.wkt
        batch.append((name, water_type, geom_wkt))

        if len(batch) >= 500:
            cur.executemany("""
                INSERT INTO water_bodies (name, type, geometry)
                VALUES (%s, %s::text, ST_GeomFromText(%s, 4326))
                ON CONFLICT DO NOTHING
            """, batch)
            conn.commit()
            count += len(batch)
            batch = []
            print(f"  Imported {count} water bodies...")

    if batch:
        cur.executemany("""
            INSERT INTO water_bodies (name, type, geometry)
            VALUES (%s, %s::text, ST_GeomFromText(%s, 4326))
            ON CONFLICT DO NOTHING
        """, batch)
        conn.commit()
        count += len(batch)

    print(f"Water bodies complete: {count} imported")
    cur.close()
    conn.close()

if __name__ == '__main__':
    print("Starting NHD Oregon import to Supabase...")
    import_flowlines()
    import_waterbodies()
    print("Import complete.")