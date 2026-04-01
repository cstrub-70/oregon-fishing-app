import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchNearestWaterBody(lat, lng) {
  const degRadius = 0.05;
  const minLat = lat - degRadius;
  const maxLat = lat + degRadius;
  const minLng = lng - degRadius;
  const maxLng = lng + degRadius;

  const bbox = `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;

  const { data, error } = await supabase
    .from('water_bodies')
    .select('id, name, type')
    .not('name', 'is', null)
    .filter('geometry', 'st_intersects', `SRID=4326;${bbox}`)
    .limit(10);

  if (error) {
    console.error('Supabase error:', JSON.stringify(error));
    return [];
  }

  if (!data || data.length === 0) return [];

  const sorted = data
    .map(w => ({
      ...w,
      distance_meters: null
    }))
    .slice(0, 5);

  return sorted;
}

export async function fetchRegulationsForWater(waterBodyName) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('rules')
    .select(`
      species,
      gear_allowed,
      method,
      bag_limit,
      size_limit_inches,
      catch_and_release_only,
      season_open,
      season_close,
      notes,
      reg_sections (
        description,
        water_bodies (
          name,
          type
        )
      )
    `)
    .eq('year', 2025)
    .lte('season_open', today)
    .gte('season_close', today);

  if (error) {
    console.error('Supabase error full:', JSON.stringify(error));
    return [];
  }

  const matched = (data || []).filter(rule => {
    const wbName = rule.reg_sections?.water_bodies?.name || '';
    return wbName.toLowerCase().includes(waterBodyName.toLowerCase()) ||
           waterBodyName.toLowerCase().includes(wbName.toLowerCase());
  });

  return matched;
}