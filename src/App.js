import { useState, useCallback, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import Map, { Layer, Source, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchNearestWaterBody, fetchRegulationsForWater } from './supabaseClient';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

export default function App() {
  const [fishingMode, setFishingMode] = useState(false);
  const [popupInfo, setPopupInfo] = useState(null);
  const [nearestWaters, setNearestWaters] = useState([]);
  const [regulations, setRegulations] = useState([]);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const [cursor, setCursor] = useState('auto');
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
            }
          });
        });
      });
    }
  }, []);

  const fetchWaterData = async (lat, lng) => {
    setLoadingRegs(true);
    setNearestWaters([]);
    setRegulations([]);

    const waters = await fetchNearestWaterBody(lat, lng);
    setNearestWaters(waters);

    if (waters.length > 0) {
      const regs = await fetchRegulationsForWater(waters[0].name);
      setRegulations(regs);
    }

    setLoadingRegs(false);
  };

  const onMapClick = useCallback((e) => {
    setPopupInfo(null);
    setNearestWaters([]);
    setRegulations([]);

    setTimeout(() => {
      setPopupInfo({
        longitude: e.lngLat.lng,
        latitude: e.lngLat.lat,
      });
      if (fishingMode) {
        fetchWaterData(e.lngLat.lat, e.lngLat.lng);
      }
    }, 0);
  }, [fishingMode]);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor('auto'), []);

  const exploreLayer = {
    id: 'waterways-explore',
    type: 'line',
    'source-layer': 'waterway',
    filter: ['in', 'class', 'river', 'stream', 'canal', 'drain', 'ditch'],
    paint: {
      'line-color': ['match', ['get', 'class'], 'river', '#1a6896', '#2d9bc4'],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        4,  ['match', ['get', 'class'], 'river', 1.5, 0.3],
        8,  ['match', ['get', 'class'], 'river', 3,   1],
        12, ['match', ['get', 'class'], 'river', 5,   2],
        16, ['match', ['get', 'class'], 'river', 7,   3]
      ],
      'line-opacity': 0.85
    }
  };

  const fishingLayer = {
    id: 'waterways-fishing',
    type: 'line',
    'source-layer': 'waterway',
    filter: ['in', 'class', 'river', 'stream', 'canal', 'drain', 'ditch'],
    paint: {
      'line-color': '#94a3b8',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        4,  ['match', ['get', 'class'], 'river', 1.5, 0.3],
        8,  ['match', ['get', 'class'], 'river', 3,   1],
        12, ['match', ['get', 'class'], 'river', 5,   2],
        16, ['match', ['get', 'class'], 'river', 7,   3]
      ],
      'line-opacity': 0.9
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>

      {waitingWorker && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%',
          transform: 'translateX(-50%)', zIndex: 20,
          background: '#1e293b', color: 'white',
          borderRadius: 10, padding: '12px 20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 12,
          fontFamily: 'sans-serif', fontSize: 13,
          whiteSpace: 'nowrap'
        }}>
          <span>New version available</span>
          <button
            onClick={() => {
              waitingWorker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }}
            style={{
              background: '#1a6896', color: 'white', border: 'none',
              borderRadius: 6, padding: '4px 12px', fontSize: 13,
              cursor: 'pointer', fontWeight: 500
            }}
          >
            Update
          </button>
        </div>
      )}

      <div
        onClick={() => setFishingMode(m => !m)}
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'white', borderRadius: 10, padding: '10px 16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: 'sans-serif', fontSize: 14, fontWeight: 500,
          color: '#1e293b', cursor: 'pointer', userSelect: 'none',
          border: fishingMode ? '2px solid #16a34a' : '2px solid #e2e8f0'
        }}
      >
        <span style={{
          width: 12, height: 12, borderRadius: '50%',
          background: fishingMode ? '#16a34a' : '#94a3b8',
          display: 'inline-block'
        }}/>
        {fishingMode ? 'Fishing mode: ON' : 'Fishing mode: OFF'}
      </div>

      {fishingMode && (
        <div style={{
          position: 'absolute', top: 64, left: 16, zIndex: 10,
          background: 'white', borderRadius: 10, padding: '12px 16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontFamily: 'sans-serif', fontSize: 13, color: '#1e293b',
          display: 'flex', flexDirection: 'column', gap: 6
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Regulation status</div>
          {[
            { color: '#16a34a', label: 'Open' },
            { color: '#dc2626', label: 'Closed' },
            { color: '#f59e0b', label: 'Restricted' },
            { color: '#94a3b8', label: 'No data yet' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 3, background: color, display: 'inline-block', borderRadius: 2 }}/>
              {label}
            </div>
          ))}
        </div>
      )}

      <Map
        initialViewState={{ longitude: -120.5, latitude: 44.0, zoom: 6 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        interactiveLayerIds={[]}
        onClick={onMapClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        cursor={cursor}
      >
        <Source id="mapbox-streets" type="vector" url="mapbox://mapbox.mapbox-streets-v8">
          {!fishingMode && <Layer {...exploreLayer} />}
          {fishingMode && <Layer {...fishingLayer} />}
        </Source>

        {popupInfo && (
          <Popup
            longitude={popupInfo.longitude}
            latitude={popupInfo.latitude}
            anchor="bottom"
            onClose={() => {
              setPopupInfo(null);
              setNearestWaters([]);
              setRegulations([]);
            }}
            closeOnClick={false}
            maxWidth="320px"
          >
            <div style={{ padding: '8px', fontFamily: 'sans-serif', minWidth: 200 }}>

              {!fishingMode && (
                <div style={{ fontSize: 12, color: '#475569' }}>
                  Turn on Fishing Mode to see regulations
                </div>
              )}

              {fishingMode && loadingRegs && (
                <div style={{ fontSize: 13, color: '#475569' }}>
                  Finding nearest waterway...
                </div>
              )}

              {fishingMode && !loadingRegs && nearestWaters.length === 0 && (
                <div style={{ fontSize: 12, color: '#475569', background: '#f1f5f9', borderRadius: 6, padding: '6px 8px' }}>
                  No waterway found within 500m of this point
                </div>
              )}

              {fishingMode && !loadingRegs && nearestWaters.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 2 }}>
                    {nearestWaters[0].name}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize', marginBottom: 8 }}>
                    {nearestWaters[0].type} — {nearestWaters[0].distance_meters ? `${Math.round(nearestWaters[0].distance_meters)}m away` : ''}
                  </div>

                  {nearestWaters.length > 1 && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                      Also nearby: {nearestWaters.slice(1).map(w => w.name).join(', ')}
                    </div>
                  )}

                  {regulations.length === 0 && (
                    <div style={{ fontSize: 12, color: '#475569', background: '#f1f5f9', borderRadius: 6, padding: '6px 8px' }}>
                      No regulation data for this water yet
                    </div>
                  )}

                  {regulations.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {regulations.map((rule, i) => (
                        <div key={i} style={{
                          background: rule.catch_and_release_only ? '#fef3c7' : '#f0fdf4',
                          border: `1px solid ${rule.catch_and_release_only ? '#fcd34d' : '#86efac'}`,
                          borderRadius: 8, padding: '8px 10px'
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 4 }}>
                            {rule.species}
                          </div>
                          <div style={{ fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {rule.catch_and_release_only
                              ? <span style={{ color: '#d97706', fontWeight: 500 }}>Catch & release only</span>
                              : <span>Bag limit: {rule.bag_limit ?? '—'}</span>
                            }
                            {rule.size_limit_inches && <span>Min size: {rule.size_limit_inches}"</span>}
                            <span>Gear: {rule.gear_allowed?.join(', ') ?? '—'}</span>
                            <span>Season: {formatDate(rule.season_open)} — {formatDate(rule.season_close)}</span>
                            {rule.notes && <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{rule.notes}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}