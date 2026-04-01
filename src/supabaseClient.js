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
  console.log('Fetching regs for:', waterBodyName);

  const { data: sections, error } = await supabase
    .from('reg_sections')
    .select(`
      description,
      water_bodies (
        name,
        type
      ),
      rules (
        species,
        gear_allowed,
        method,
        bag_limit,
        size_limit_inches,
        catch_and_release_only,
        season_open,
        season_close,
        notes,
        year
      )
    `)
    .ilike('water_bodies.name', `%${waterBodyName.split(' ')[0]}%`);

  console.log('Sections found:', sections?.length, sections);

  if (error) {
    console.error('Supabase error:', JSON.stringify(error));
    return [];
  }

  if (!sections) return [];

  const now = new Date();
  const rules = [];

  for (const section of sections) {
    if (!section.rules || section.rules.length === 0) continue;
    console.log('Rules in section:', section.description, section.rules);
    for (const rule of section.rules) {
      if (!rule.season_open || !rule.season_close) continue;
      const openDate = new Date(rule.season_open);
      const closeDate = new Date(rule.season_close);
      if (now >= openDate && now <= closeDate) {
        rules.push(rule);
      }
    }
  }

  console.log('Matched rules:', rules.length);
  const unique = [];
const seen = new Set();
for (const rule of rules) {
  const key = `${rule.species}-${rule.gear_allowed?.join(',')}-${rule.bag_limit}`;
  if (!seen.has(key)) {
    seen.add(key);
    unique.push(rule);
  }
}
console.log('Unique rules:', unique.length);
return unique;
}