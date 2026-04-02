import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Descriptions containing these words are lake/pond sections
const LAKE_INDICATORS = ['lake', 'reservoir', 'pond', 'pool'];

// NHD types that indicate a lake/standing water feature
const LAKE_TYPES = ['lake', 'reservoir', 'pond', 'pool', 'lake/pond'];

function sectionIsLake(description) {
  const lower = description.toLowerCase();
  // Must contain a lake word but NOT also a stream word that dominates
  // e.g. "Round Lake Collawash River" contains both — treat as lake
  // e.g. "Leaburg Lake" — lake
  // e.g. "Willamette River" — not lake
  return LAKE_INDICATORS.some(w => lower.includes(w));
}

function waterBodyIsLake(type) {
  if (!type) return false;
  return LAKE_TYPES.some(w => type.toLowerCase().includes(w));
}

function pickBestSection(sections, waterBodyName, waterType, isParentMatch) {
  if (!sections || sections.length === 0) return null;
  if (sections.length === 1) return sections[0];

  const clickedIsLake = waterBodyIsLake(waterType);
  const nameLower = waterBodyName.toLowerCase();

  const scored = sections.map(s => {
    const desc = s.description.toLowerCase();
    let score = 0;

    // Exact water body name in description — strongest signal
    if (desc.includes(nameLower)) score += 100;

    // Zone-wide general is last resort
    if (desc.includes('general regulations')) score -= 80;

    // Water type matching
    if (clickedIsLake && sectionIsLake(s.description)) score += 25;
    if (!clickedIsLake && sectionIsLake(s.description)) score -= 40;

    // For parent river fallback: prefer tributary/mainstem sections
    // over specific named segments like "mouth to River Mill Dam"
    if (isParentMatch) {
      if (desc.includes('tributaries')) score += 30;
      if (desc.includes('mainstem')) score += 10;
      if (desc.includes('mouth to') || desc.includes('dam to') || desc.includes('bridge to')) score -= 20;
      if (desc.includes('above') && desc.includes('dam')) score += 5;
    }

    return { section: s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  console.log('Section scores:', scored.map(s => `"${s.section.description}" → ${s.score}`).join('\n'));
  return scored[0].section;
}

export async function fetchNearestWaterBody(lat, lng) {
  const response = await fetch(
    `https://oregon-fishing-app-production.up.railway.app/nearest-water?lat=${lat}&lng=${lng}`
  );
  if (!response.ok) {
    console.error('Backend error:', response.status);
    return [];
  }
  return (await response.json()) || [];
}

export async function fetchRegulationsForWater(waterBodyName, waters = []) {
  console.log('Fetching regs for:', waterBodyName);

  const clickedWater = waters.find(w => w.name === waterBodyName && !w.is_parent);
  const waterType = clickedWater?.type || '';
  const clickedIsLake = waterBodyIsLake(waterType);
  console.log('clickedWater:', clickedWater, 'waterType:', waterType, 'isLake:', clickedIsLake); // ADD THIS

  const selectQuery = `
    id,
    description,
    water_bodies ( name ),
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
  `;

  let sections = null;
  let isParentMatch = false;

  // ── Step 1: Full name match ──────────────────────────────────────────────
  // Filter results immediately by water type to avoid e.g. Collawash River
  // matching "Round Lake Collawash River" when the user clicked a river.
  const { data: step1, error } = await supabase
    .from('reg_sections')
    .select(selectQuery)
    .ilike('description', `%${waterBodyName}%`);

  if (error) {
    console.error('Supabase error:', JSON.stringify(error));
    return [];
  }

  if (step1 && step1.length > 0) {
    // Filter: if clicked water is a stream/river, exclude pure lake sections
    // unless there are no non-lake results at all
    if (!clickedIsLake) {
      const streamOnly = step1.filter(s => !sectionIsLake(s.description));
      sections = streamOnly.length > 0 ? streamOnly : step1;
    } else {
      sections = step1;
    }
  }

  // ── Step 2: Keyword fallback ─────────────────────────────────────────────
  // Skip common directional/size words AND generic geographic terms
  if (!sections) {
    const skip = new Set([
      'North', 'South', 'East', 'West', 'Little', 'Upper', 'Lower',
      'Middle', 'Fork', 'Hot', 'Cold', 'Big', 'Small', 'Clear',
      'Deep', 'Long', 'Lost', 'Bear', 'Dry', 'Mud', 'Sand'
    ]);
    const words = waterBodyName.split(' ');
    const keyword = words.find(w => !skip.has(w)) || words[0];
    console.log('Keyword fallback:', keyword);

    const { data: step2 } = await supabase
      .from('reg_sections')
      .select(selectQuery)
      .ilike('description', `%${keyword}%`);

    if (step2 && step2.length > 0) {
      if (!clickedIsLake) {
        const streamOnly = step2.filter(s => !sectionIsLake(s.description));
        sections = streamOnly.length > 0 ? streamOnly : step2;
      } else {
        sections = step2;
      }
    }
  }

  // ── Step 3: Parent river fallback ────────────────────────────────────────
  // Backend returns the nearest water body whose name appears in a reg_section
  // flagged as is_parent: true. Covers unlisted tributaries.
  if (!sections) {
    const parentWater = waters.find(w => w.is_parent);
    if (parentWater) {
      console.log('Parent river fallback:', parentWater.name);
      const { data: step3 } = await supabase
        .from('reg_sections')
        .select(selectQuery)
        .ilike('description', `%${parentWater.name}%`);

      if (step3 && step3.length > 0) {
        // For a stream tributary, exclude lake sections from parent results
        if (!clickedIsLake) {
          const streamOnly = step3.filter(s => !sectionIsLake(s.description));
          sections = streamOnly.length > 0 ? streamOnly : step3;
        } else {
          sections = step3;
        }
        isParentMatch = true;
      }
    }
  }

  // ── Step 4: Zone-wide general regulations ────────────────────────────────
  if (!sections) {
    console.log('Zone-wide general fallback');
    const { data: step4 } = await supabase
      .from('reg_sections')
      .select(selectQuery)
      .ilike('description', '%General Regulations 2026%');
    sections = step4;
  }

  if (!sections || sections.length === 0) return [];

  // ── Step 5: Score and pick best section ──────────────────────────────────
  const best = pickBestSection(sections, waterBodyName, waterType, isParentMatch);
  if (!best) return [];
  console.log('Selected:', best.description);

  // ── Step 6: Filter rules by date ─────────────────────────────────────────
  const now = new Date();
  const rules = [];

  for (const rule of best.rules || []) {
    if (rule.year && rule.year !== 2026) continue;

    if (!rule.season_open || !rule.season_close) {
      rules.push({ ...rule, sectionDescription: best.description });
      continue;
    }

    const open = new Date(rule.season_open);
    const close = new Date(rule.season_close);
    if (now >= open && now <= close) {
      rules.push({ ...rule, sectionDescription: best.description });
    }
  }

  // ── Step 7: Deduplicate ───────────────────────────────────────────────────
  const unique = [];
  const seen = new Set();
  for (const rule of rules) {
    const key = `${rule.species}-${rule.bag_limit}-${rule.catch_and_release_only}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rule);
    }
  }

  console.log('Final rules:', unique.length);
  return unique;
}
