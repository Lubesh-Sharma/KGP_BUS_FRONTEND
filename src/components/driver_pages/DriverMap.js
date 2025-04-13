import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { getApiUrl } from '../../utils/api2';
import '../../css/DriverMap.css';

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/30/30979.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40]
});

// Bus stop icon
const busStopIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1165/1165895.png',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// Component to handle the current location button
const LocationButton = ({ centerMap }) => {
  return (
    <div className="location-button-container">
      <button 
        className="location-button" 
        onClick={centerMap}
        title="Center map on your location"
      >
        <i className="fas fa-location-arrow"></i> Your Location
      </button>
    </div>
  );
};

// Component to handle map centering
const MapController = ({ center, zoom }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, map]);
  
  return null;
};

// Component to update driver's location in the database
const LocationUpdater = ({ driverId, busId, position }) => {
  useEffect(() => {
    if (!position || !busId) return;

    const updateLocation = async () => {
      try {
        await axios.post(
          getApiUrl('/driver/update-location'),
          {
            busId,
            latitude: position[0],
            longitude: position[1]
          },
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );
        //console.log('Location updated successfully');
      } catch (error) {
        console.error('Error updating location:', error);
      }
    };

    updateLocation();
    
    // Update location every 10 seconds
    const interval = setInterval(updateLocation, 10000);
    
    return () => clearInterval(interval);
  }, [position, busId, driverId]);
  
  return null;
};

// Component to draw OSRM route between stops
const OsrmRoute = ({ startPoint, endPoint, color = '#3388ff', weight = 5 }) => {
  const map = useMap();
  const routeRef = useRef(null);
  
  useEffect(() => {
    if (!startPoint || !endPoint) return;
    
    const fetchRoute = async () => {
      try {
        // Clear previous route
        if (routeRef.current) {
          map.removeLayer(routeRef.current);
          routeRef.current = null;
        }
        
        const response = await axios.get(
          `https://router.project-osrm.org/route/v1/driving/${startPoint[1]},${startPoint[0]};${endPoint[1]},${endPoint[0]}?overview=full&geometries=geojson`
        );
        
        if (response.data.code === 'Ok' && response.data.routes.length > 0) {
          const routeGeometry = response.data.routes[0].geometry.coordinates;
          // OSRM returns coordinates as [lng, lat], we need to flip for Leaflet
          const coordinates = routeGeometry.map(coord => [coord[1], coord[0]]);
          
          // Create a polyline and add to map
          const polyline = L.polyline(coordinates, {
            color: color,
            weight: weight,
            opacity: 0.7,
            lineJoin: 'round'
          }).addTo(map);
          
          routeRef.current = polyline;
        }
      } catch (error) {
        console.error('Error fetching route:', error);
      }
    };
    
    fetchRoute();
    
    return () => {
      if (routeRef.current) {
        map.removeLayer(routeRef.current);
      }
    };
  }, [map, startPoint, endPoint, color, weight]);
  
  return null;
};

// Component for tracking driver location with geolocation API
const DriverLocationTracker = ({ setPosition }) => {
  const map = useMapEvents({
    locationfound(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
    locationerror(e) {
      console.error('Location error:', e.message);
      alert('Could not get your location. Please enable location services.');
    }
  });
  
  useEffect(() => {
    // Start tracking location when component mounts
    map.locate({ watch: true, enableHighAccuracy: true });
    
    return () => {
      map.stopLocate();
    };
  }, [map]);
  
  return null;
};

// Main driver map component
function DriverMap({ user }) {
  const [position, setPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState([22.3190, 87.3091]); // Default IIT KGP coordinates
  const [zoom, setZoom] = useState(15);
  const [driverBus, setDriverBus] = useState(null);
  const [busRoute, setBusRoute] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);
  
  // Fetch driver's assigned bus on component mount
  useEffect(() => {
    const fetchDriverBus = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          getApiUrl('/driver/my-bus'),
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );
        
        if (response.data) {
          setDriverBus(response.data);
          //console.log('Driver bus:', response.data);
        }
      } catch (err) {
        console.error('Error fetching driver bus:', err);
        setError('Failed to fetch your assigned bus. Please refresh the page or contact support.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDriverBus();
  }, [user]);
  
  // Fetch bus route when driver bus is available
  useEffect(() => {
    if (!driverBus || !driverBus.id) return;
    
    const fetchBusRoute = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          getApiUrl(`/buses/${driverBus.id}/route`),
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );
        
        if (response.data && response.data.data && response.data.data.stops) {
          setBusRoute(response.data.data.stops);
          //console.log('Bus route:', response.data.data.stops);
        }
      } catch (err) {
        console.error('Error fetching bus route:', err);
        setError('Failed to fetch the bus route. Please refresh the page or contact support.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBusRoute();
  }, [driverBus]);
  
  // Center map on driver's location when available
  useEffect(() => {
    if (position) {
      setMapCenter(position);
    }
  }, [position]);
  
  // Handle "Your Location" button click
  const centerMap = useCallback(() => {
    if (position) {
      setMapCenter(position);
      setZoom(16);
    } else {
      if (mapRef.current) {
        mapRef.current.locate({ setView: true, maxZoom: 16 });
      }
    }
  }, [position]);
  
  // Determine current route segment based on stops_cleared
  const getCurrentRouteSegment = useCallback(() => {
    if (!busRoute.length || !driverBus) return null;
    
    const stopsCleared = driverBus.stops_cleared || 0;
    // Find the stop with order matching stops_cleared
    const currentStop = busRoute.find(stop => stop.stop_order === stopsCleared);
    // Next stop is the one after current (or first if we're at the end)
    const nextStop = busRoute.find(stop => stop.stop_order === stopsCleared + 1) || busRoute[0];
    
    if (currentStop && nextStop) {
      return {
        start: [parseFloat(currentStop.latitude), parseFloat(currentStop.longitude)],
        end: [parseFloat(nextStop.latitude), parseFloat(nextStop.longitude)]
      };
    }
    
    return null;
  }, [busRoute, driverBus]);
  
  const currentSegment = getCurrentRouteSegment();
  
  // Mark next stop as cleared
  const markStopCleared = async (stopOrder) => {
    if (!driverBus || !driverBus.id) return;
    
    try {
      await axios.post(
        getApiUrl('/driver/clear-stop'),
        {
          busId: driverBus.id,
          stopOrder: stopOrder
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
          }
        }
      );
      
      // Update local state
      setDriverBus(prev => ({
        ...prev,
        stops_cleared: stopOrder
      }));
      
      //console.log('Stop cleared:', stopOrder);
    } catch (error) {
      console.error('Error clearing stop:', error);
      alert('Failed to mark stop as cleared. Please try again.');
    }
  };
  
  if (loading && !driverBus) {
    return <div className="loading">Loading driver information...</div>;
  }
  
  if (error) {
    return <div className="error">{error}</div>;
  }
  
  return (
    <div className="driver-map-container">
      {driverBus && (
        <div className="bus-info">
          <h2>Bus: {driverBus.name}</h2>
          <p>Stops cleared: {driverBus.stops_cleared || 0} / {busRoute.length}</p>
        </div>
      )}
      
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        className="driver-map"
        ref={mapRef}
        whenCreated={map => { mapRef.current = map; }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController center={mapCenter} zoom={zoom} />
        <DriverLocationTracker setPosition={setPosition} />
        
        {position && (
          <Marker position={position} icon={busIcon}>
            <Popup>
              <div>
                <strong>Your current location</strong>
                <p>Bus: {driverBus?.name || 'Not assigned'}</p>
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* Display all bus stops in the route */}
        {busRoute.map(stop => (
          <Marker
            key={stop.id}
            position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
            icon={busStopIcon}
          >
            <Popup>
              <div>
                <strong>{stop.name}</strong>
                <p>Stop #{stop.stop_order}</p>
                {driverBus && driverBus.stops_cleared < stop.stop_order && (
                  <button 
                    onClick={() => markStopCleared(stop.stop_order)}
                    className="clear-stop-button"
                  >
                    Mark as Reached
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        
        {/* Show complete route between all stops */}
        {busRoute.length > 1 && busRoute.map((stop, index) => {
          const nextIndex = (index + 1) % busRoute.length;
          const nextStop = busRoute[nextIndex];
          
          return (
            <OsrmRoute
              key={`route-${stop.id}-${nextStop.id}`}
              startPoint={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
              endPoint={[parseFloat(nextStop.latitude), parseFloat(nextStop.longitude)]}
              color="#3388ff"
              weight={3}
            />
          );
        })}
        
        {/* Highlight current segment with a thicker, brighter line */}
        {currentSegment && (
          <OsrmRoute
            startPoint={currentSegment.start}
            endPoint={currentSegment.end}
            color="#00a8ff"
            weight={6}
          />
        )}
        
        {/* Location update handler */}
        {position && driverBus && (
          <LocationUpdater 
            driverId={user.id}
            busId={driverBus.id}
            position={position}
          />
        )}
      </MapContainer>
      
      <LocationButton centerMap={centerMap} />
    </div>
  );
}

export default DriverMap;
