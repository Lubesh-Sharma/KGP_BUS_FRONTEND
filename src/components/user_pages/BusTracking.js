import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import api from '../../utils/api.js';
import '../../css/busTracking.css';

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/30/30979.png',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

// User location icon
const userIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1077/1077114.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

// Bus stop icon
const busStopIcon = new L.Icon({
  iconUrl: '/bus-stop.png', // File in public folder
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// Configure OSRM routing to load faster
function configureRoutingMachine() {
  if (typeof L !== 'undefined' && L.Routing) {
    // Modify the global routing options
    L.Routing.Itinerary.prototype.options.createGeocoderPane = false;
    L.Routing.timeout = 10 * 1000; // 10 seconds timeout

    // Override the error handling globally
    if (L.Routing.ErrorControl && L.Routing.ErrorControl.prototype) {
      L.Routing.ErrorControl.prototype._routingErrorHandler = function (e) {
        console.warn("Handled routing error:", e);
        // No UI updates or errors thrown
      };
    }

    // Fix issues with the layer removal
    if (L.Routing.Line && L.Routing.Line.prototype) {
      const originalClearLines = L.Routing.Line.prototype._clearLines;
      L.Routing.Line.prototype._clearLines = function () {
        try {
          // Safety check before calling the original function
          if (this._map && this._route && this._route._layers) {
            originalClearLines.call(this);
          }
        } catch (e) {
          console.warn("Protected from _clearLines error:", e);
          // Manual cleanup as fallback
          if (this._map && this._route) {
            try {
              this._map.removeLayer(this._route);
            } catch (e) {
              console.warn("Also failed with manual cleanup:", e);
            }
          }
        }
      };
    }
  }
}

// Component to handle routing between points
const RoutingControl = ({ startPoint, endPoint, color = '#3388ff', weight = 4, setIsPathLoading }) => {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!startPoint || !endPoint) return;

    // Configure routing machine when component mounts
    configureRoutingMachine();

    // Indicate loading has started
    setIsPathLoading(true);

    // Clear previous routing if it exists and ensure it is attached to the map
    if (routingControlRef.current && map && map.hasLayer(routingControlRef.current)) {
      map.removeControl(routingControlRef.current);
      routingControlRef.current = null;
    }

    try {
      const routingControl = L.Routing.control({
        waypoints: [
          L.latLng(startPoint[0], startPoint[1]),
          L.latLng(endPoint[0], endPoint[1])
        ],
        routeWhileDragging: false,
        showAlternatives: false,
        addWaypoints: false,
        fitSelectedRoutes: false,
        show: false,
        lineOptions: {
          styles: [{ color, opacity: 0.7, weight }],
          extendToWaypoints: true,
          missingRouteTolerance: 0
        },
        createMarker: () => null, // No markers from routing
        serviceUrl: 'https://router.project-osrm.org/route/v1' // Explicitly set OSRM service
      });

      // Add listeners to handle loading state
      routingControl.on('routesfound', () => {
        setTimeout(() => setIsPathLoading(false), 300); // Short delay to ensure UI is updated
      });

      routingControl.on('routingerror', () => {
        console.warn("Routing error occurred");
        setIsPathLoading(false);
      });

      routingControl.addTo(map);
      routingControlRef.current = routingControl;

      // Add a timeout in case routing takes too long
      const timeout = setTimeout(() => {
        setIsPathLoading(false);
      }, 10000); // 10 second timeout

      return () => {
        clearTimeout(timeout);
        // Cleanup: remove the control if it exists on the map
        if (routingControlRef.current && map && map.hasLayer(routingControlRef.current)) {
          map.removeControl(routingControlRef.current);
        }
        setIsPathLoading(false);
      };
    } catch (error) {
      console.error("Error setting up routing:", error);
      setIsPathLoading(false);
    }
  }, [map, startPoint, endPoint, color, weight, setIsPathLoading]);

  return null;
};

// Component to recenter map when needed
const MapViewController = ({ center, zoom, busLocation }) => {
  const map = useMap();

  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom);
    } else if (busLocation) {
      map.setView(busLocation, map.getZoom());
    }
  }, [map, center, zoom, busLocation]);

  return null;
};

// Custom location control component
const LocationButton = ({ setUserLocation }) => {
  const map = useMap();

  const handleLocationRequest = () => {
    map.locate({ setView: true, maxZoom: 16 });
  };

  useEffect(() => {
    map.on('locationfound', (e) => {
      setUserLocation([e.latlng.lat, e.latlng.lng]);
      map.flyTo(e.latlng, 16);
    });

    map.on('locationerror', (e) => {
      console.error("Location error:", e.message);
      alert("Unable to find your location. Please check your device settings.");
    });

    return () => {
      map.off('locationfound');
      map.off('locationerror');
    };
  }, [map, setUserLocation]);

  return (
    <div className="location-control">
      <button onClick={handleLocationRequest} title="Show my location">
        <i className="fas fa-location-arrow"></i>
      </button>
    </div>
  );
};

const BusTracking = ({ userLocation, setUserLocation }) => {
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [busLocation, setBusLocation] = useState(null);
  const [busStops, setBusStops] = useState([]);
  const [nextStop, setNextStop] = useState(null);
  const [currentStop, setCurrentStop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [busInfo, setBusInfo] = useState(null);
  const [mapCenter, setMapCenter] = useState(userLocation || [22.3190, 87.3091]); // Default to IIT KGP
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const intervalRef = useRef(null);

  // State for the custom dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const [isPathLoading, setIsPathLoading] = useState(false);

  // Fetch list of buses on mount
  useEffect(() => {
    fetchBuses();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Fetch bus data when selection changes
  useEffect(() => {
    if (selectedBus) {
      fetchBusData(selectedBus.id);
      setIsInitialLoad(false);
      intervalRef.current = setInterval(() => {
        fetchBusData(selectedBus.id, false);
      }, 15000); // Refresh every 15 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [selectedBus]);

  const fetchBuses = async () => {
    try {
      setLoading(true);
      const response = await api.get('/buses/getAllBuses');
      if (response.data && response.data.data) {
        setBuses(response.data.data);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching buses:', err);
      setError('Failed to load buses. Please try again later.');
      setLoading(false);
    }
  };

  const fetchBusData = async (busId, showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      // Fetch bus location remains the same
      const locationResponse = await api.get(`/buses/${busId}/location`);
      if (locationResponse.data && locationResponse.data.data) {
        const location = locationResponse.data.data;
        setBusLocation([parseFloat(location.latitude), parseFloat(location.longitude)]);
        setLastUpdated(new Date(location.timestamp));
        if (isInitialLoad || !busLocation) {
          setMapCenter([parseFloat(location.latitude), parseFloat(location.longitude)]);
        }
      } else {
        setBusLocation(null);
      }

      // Now fetch the route with stops using the new endpoint
      const routeResponse = await api.get(`/abusroute/${busId}/route-with-stops`);
      if (routeResponse.data && routeResponse.data.data) {
        const routeData = routeResponse.data.data;

        // Ensure each stop has estimated_time property
        const stops = routeData.stops.map(stop => {
          // If the API already provides time information, keep it
          if (stop.estimated_time !== undefined) {
            return stop;
          }

          // If next stop has estimated arrival from busInfo, use that for the next stop
          if (routeData.nextStop && routeData.nextStop.id === stop.id &&
            busInfo && busInfo.estimatedArrival) {
            return { ...stop, estimated_time: busInfo.estimatedArrival + ' min' };
          }

          // For other stops, calculate an estimated time based on stop order if possible
          // This is a placeholder - your backend should ideally provide this data
          return stop;
        });

        setBusStops(stops);
        if (routeData.currentStop) setCurrentStop(routeData.currentStop);
        if (routeData.nextStop) setNextStop(routeData.nextStop);
      }

      // Fetch bus info remains the same
      const infoResponse = await api.get(`/buses/${busId}/info`);
      if (infoResponse.data && infoResponse.data.data) {
        setBusInfo(infoResponse.data.data);
      }

      if (showLoading) setLoading(false);
    } catch (err) {
      console.error('Error fetching bus data:', err);
      setError('Failed to load bus data. Please try again.');
      if (showLoading) setLoading(false);
    }
  };
  // Filter buses based on search query
  const filteredBuses = buses.filter(bus =>
    bus.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle selecting a bus from the dropdown
  const handleBusSelect = (bus) => {
    setSelectedBus(bus);
    setSearchQuery(bus.name);
    setIsDropdownOpen(false);
    setError(null);
  };

  // Prepare polyline coordinates for stops
  const getPolylineCoordinates = () => {
    if (!busStops || busStops.length === 0) return null;
    // Ensure stops are sorted by stop_order
    const sortedStops = [...busStops].sort((a, b) => a.stop_order - b.stop_order);
    return sortedStops.map(stop => [parseFloat(stop.latitude), parseFloat(stop.longitude)]);
  };

  // Create cleared and remaining routes
  const getRoutePolylines = () => {
    if (!busStops || busStops.length === 0) return { cleared: null, remaining: null };
    const sortedStops = [...busStops].sort((a, b) => a.stop_order - b.stop_order);
    const clearedStops = sortedStops.filter(stop => stop.cleared);
    const remainingStops = sortedStops.filter(stop => !stop.cleared);

    // For remaining route, if there are cleared stops, include the last cleared stop as starting point
    let remainingPoints = remainingStops.map(stop => [parseFloat(stop.latitude), parseFloat(stop.longitude)]);
    if (clearedStops.length > 0 && remainingPoints.length > 0) {
      const lastCleared = clearedStops[clearedStops.length - 1];
      remainingPoints = [[parseFloat(lastCleared.latitude), parseFloat(lastCleared.longitude)], ...remainingPoints];
    }

    const clearedPoints = clearedStops.map(stop => [parseFloat(stop.latitude), parseFloat(stop.longitude)]);

    return {
      cleared: clearedPoints.length > 1 ? clearedPoints : null,
      remaining: remainingPoints.length > 1 ? remainingPoints : null
    };
  };

  const { cleared, remaining } = getRoutePolylines();

  return (
    <div className="bus-tracking">
      {/* Full-page loading overlay for OSRM loading */}
      {isPathLoading && (
        <div className="full-page-loading-overlay">
          <div className="spinner"></div>
          <div>Loading routes. Please wait...</div>
        </div>
      )}

      <div className="location-panel">
        <h2>Track a BUS</h2>
        <div className="bus-search">
          <div className="custom-dropdown" ref={dropdownRef}>
            <div className="dropdown-header" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                placeholder="Search for a bus..."
                className="dropdown-search"
                onClick={(e) => { e.stopPropagation(); setIsDropdownOpen(true); }}
              />
              <div className="dropdown-icon">
                <i className={`fa fa-chevron-${isDropdownOpen ? 'up' : 'down'}`}></i>
              </div>
            </div>
            {isDropdownOpen && (
              <ul className="dropdown-list">
                {filteredBuses.length > 0 ? (
                  filteredBuses.map(bus => (
                    <li
                      key={bus.id}
                      onClick={() => handleBusSelect(bus)}
                      className={selectedBus && selectedBus.id === bus.id ? 'selected' : ''}
                    >
                      {bus.name}
                    </li>
                  ))
                ) : (
                  <li className="no-results">No buses found</li>
                )}
              </ul>
            )}
          </div>
          <button
            className="track-bus-btn"
            onClick={() => selectedBus && fetchBusData(selectedBus.id)}
            disabled={!selectedBus || loading}
          >
            {loading ? 'Loading...' : 'Track Bus'}
          </button>
        </div>
        {/* New: Display route order with colored text for cleared (green) and remaining (blue) stops */}
        {/* New: Display route order with colored text for cleared (green) and remaining (blue) stops */}
        {selectedBus && busStops.length > 0 && (
          <div className="bus-stop-order">
            <h4>Route Order</h4>
            <ul>
              {[...busStops]
                .sort((a, b) => a.stop_order - b.stop_order)
                .map(stop => (
                  <li key={stop.id} style={{ color: stop.cleared ? '#00ff00' : '#0000ff' }}>
                    {stop.stop_order}. {stop.name}
                    {stop.estimated_time && (
                      <span className="stop-time"> - {stop.estimated_time}</span>
                    )}
                  </li>
                ))
              }
            </ul>
          </div>
        )}
        {error && <div className="error-message">{error}</div>}
        {selectedBus && !busLocation && (
          <div className="selected-bus-info">
            <h4>{selectedBus.name}</h4>
            <div className="bus-status not-active">
              <p>This bus is currently not in service.</p>
            </div>
          </div>
        )}
        {selectedBus && busLocation && (
          <div className="selected-bus-info">
            <h4>{selectedBus.name}</h4>
            <div className="bus-status active">
              <p><strong>Status:</strong> Active</p>
              <p><strong>Last Updated:</strong> {lastUpdated ? lastUpdated.toLocaleTimeString() : 'N/A'}</p>
              {busInfo && (
                <>
                  <p><strong>Driver:</strong> {busInfo.driverName || 'Not assigned'}</p>
                  {currentStop && <p><strong>Last Stop:</strong> {currentStop.name}</p>}
                  {nextStop && (
                    <>
                      <p><strong>Next Stop:</strong> {nextStop.name}</p>
                      {busInfo.estimatedArrival && (
                        <p><strong>ETA:</strong> {busInfo.estimatedArrival} min</p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {!selectedBus && (
          <div className="initial-message">
            <p>Please select a bus from the dropdown above to track its location.</p>
          </div>
        )}
      </div>

      <div className="map-container">
        <MapContainer
          center={userLocation || [22.3190, 87.3091]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationButton setUserLocation={setUserLocation} />
          {userLocation && (
            <Marker position={userLocation} icon={userIcon}>
              <Popup>Your location</Popup>
            </Marker>
          )}
          {(selectedBus && busLocation) && (
            <MapViewController center={mapCenter} busLocation={busLocation} />
          )}
          {(selectedBus && busLocation) && (
            <Marker position={busLocation} icon={busIcon}>
              <Popup>
                <div className="bus-popup">
                  <h3>{selectedBus.name}</h3>
                  {busInfo && (
                    <>
                      <p><strong>Driver:</strong> {busInfo.driverName || 'Not assigned'}</p>
                      <p><strong>Last Updated:</strong> {lastUpdated ? lastUpdated.toLocaleTimeString() : 'N/A'}</p>
                      {busInfo.estimatedArrival && nextStop && (
                        <p><strong>ETA to {nextStop.name}:</strong> {busInfo.estimatedArrival} min</p>
                      )}
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Render markers for ALL bus stops */}
          {selectedBus && busStops.length > 0 && (
            busStops.map(stop => (
              <Marker key={stop.id} position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]} icon={busStopIcon}>
                <Popup>
                  <div className="stop-popup">
                    <h3>{stop.name}</h3>
                    <p>Stop Order: {stop.stop_order}</p>
                    <p>estimated_time: {stop.estimated_time}</p>
                  </div>
                </Popup>
              </Marker>
            ))
          )}

          {/* Render actual route lines between adjacent bus stops using RoutingControl */}
          {selectedBus && busStops.length > 1 && (
            <>
              {[...busStops]
                .sort((a, b) => a.stop_order - b.stop_order)
                .map((stop, idx, arr) => {
                  if (idx < arr.length - 1) {
                    return (
                      <RoutingControl
                        key={`${stop.id}-${arr[idx + 1].id}`}
                        startPoint={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
                        endPoint={[parseFloat(arr[idx + 1].latitude), parseFloat(arr[idx + 1].longitude)]}
                        color="#3388ff"
                        weight={4}
                        setIsPathLoading={setIsPathLoading}
                      />
                    );
                  }
                  return null;
                })}
            </>
          )}

          {/* Route from user to next stop */}
          {(selectedBus && userLocation && nextStop) && (
            <RoutingControl
              startPoint={userLocation}
              endPoint={[parseFloat(nextStop.latitude), parseFloat(nextStop.longitude)]}
              color="#ff6b6b"
              weight={3}
              setIsPathLoading={setIsPathLoading}
            />
          )}

        </MapContainer>

        {(selectedBus && busLocation && nextStop) && (
          <div className="map-legend">
            <div className="legend-item">
              <div className="legend-icon" style={{ backgroundColor: '#3388ff' }}></div>
              <span>Bus Route to Next Stop</span>
            </div>
            {userLocation && (
              <div className="legend-item">
                <div className="legend-icon" style={{ backgroundColor: '#ff6b6b' }}></div>
                <span>Your Path to Next Stop</span>
              </div>
            )}
            <div className="legend-item">
              <div className="legend-icon" style={{ backgroundColor: '#00ff00' }}></div>
              <span>Cleared Stops</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon" style={{ backgroundColor: '#0000ff' }}></div>
              <span>Remaining Stops</span>
            </div>
          </div>
        )}
        {!selectedBus && (
          <div className="map-instructions-overlay">
            <p>Select a bus from the left panel to see its location and route</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BusTracking;
