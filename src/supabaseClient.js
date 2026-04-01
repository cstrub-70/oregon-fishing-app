import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchNearestWaterBody(lat, lng) {
  const response = await fetch(
    `https://oregon-fishing-app-production.up.railway.app/nearest-water?lat=${lat}&lng=${lng}`
  );

  if (!response.ok) {
    console.error('Backend error:', response.status);
    return [];
  }

  const data = await response.json();
  return data || [];
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