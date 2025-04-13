import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../../utils/api2.js';
import '../../css/DriverMapScreen.css';

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

// Next stop icon (highlighted)
const nextStopIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1165/1165895.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
  className: 'next-stop-icon' // CSS class for styling
});

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
    
    // Update location every 10 seconds (changed from 5 seconds)
    const interval = setInterval(updateLocation, 10000);
    
    return () => clearInterval(interval);
  }, [position, busId, driverId]);
  
  return null;
};

// Component to detect proximity to next bus stop
const ProximityDetector = ({ busId, position, nextStop, onStopReached }) => {
  useEffect(() => {
    if (!position || !nextStop || !busId) return;

    const checkProximity = () => {
      const nextStopPosition = [
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      ];
      
      // Calculate distance between driver and next stop (in meters)
      const distance = L.latLng(position).distanceTo(L.latLng(nextStopPosition));
      
      // If within 30 meters, mark the stop as cleared
      if (distance <= 30) {
        //console.log(`Within 30m of next stop (${distance.toFixed(2)}m). Auto-clearing stop.`);
        onStopReached(busId, nextStop.stop_id);
      }
    };
    
    // Check proximity every second
    const interval = setInterval(checkProximity, 1000);
    
    return () => clearInterval(interval);
  }, [position, nextStop, busId, onStopReached]);
  
  return null;
};

// Component to draw OSRM route between stops
const OsrmRoutes = ({ stops, currentPosition, lastClearedStopIndex, nextStopIndex }) => {
  const map = useMap();
  const routeRef = useRef(null);
  const nextSegmentRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (!stops || stops.length < 2 || !map) return;
    
    const fetchAndDrawFullRoute = async () => {
      try {
        setIsLoading(true);
        
        // Clear previous route
        if (routeRef.current) {
          map.removeLayer(routeRef.current);
          routeRef.current = null;
        }
        
        // Build waypoints for the complete route
        const waypoints = stops.map(stop => [
          parseFloat(stop.longitude), 
          parseFloat(stop.latitude)
        ]);
        
        // Close the loop for circular route
        waypoints.push(waypoints[0]);
        
        // Convert waypoints to the format expected by OSRM API
        const waypointsString = waypoints.map(wp => wp.join(',')).join(';');
        
        const response = await axios.get(
          `https://router.project-osrm.org/route/v1/driving/${waypointsString}?overview=full&geometries=geojson`
        );
        
        if (response.data.code === 'Ok' && response.data.routes.length > 0) {
          const routeGeometry = response.data.routes[0].geometry.coordinates;
          // OSRM returns coordinates as [lng, lat], we need to flip for Leaflet
          const coordinates = routeGeometry.map(coord => [coord[1], coord[0]]);
          
          // Create a polyline for the full route
          const polyline = L.polyline(coordinates, {
            color: '#3388ff',
            weight: 4,
            opacity: 0.6,
            lineJoin: 'round'
          }).addTo(map);
          
          routeRef.current = polyline;
        }
      } catch (error) {
        console.error('Error fetching full route:', error);
      }
    };
    
    const fetchAndDrawNextSegment = async () => {
      try {
        // Clear previous next segment route
        if (nextSegmentRef.current) {
          map.removeLayer(nextSegmentRef.current);
          nextSegmentRef.current = null;
        }
        
        // Only draw if we have a last cleared stop and next stop
        if (lastClearedStopIndex !== null && nextStopIndex !== null) {
          const lastClearedStop = stops[lastClearedStopIndex];
          const nextStop = stops[nextStopIndex];
          
          // Build waypoints from last cleared stop to next stop
          const waypoints = [
            [parseFloat(lastClearedStop.longitude), parseFloat(lastClearedStop.latitude)], // Last cleared stop [lng, lat]
            [parseFloat(nextStop.longitude), parseFloat(nextStop.latitude)] // Next stop [lng, lat]
          ];
          
          // Convert waypoints to the format expected by OSRM API
          const waypointsString = waypoints.map(wp => wp.join(',')).join(';');
          
          const response = await axios.get(
            `https://router.project-osrm.org/route/v1/driving/${waypointsString}?overview=full&geometries=geojson`
          );
          
          if (response.data.code === 'Ok' && response.data.routes.length > 0) {
            const routeGeometry = response.data.routes[0].geometry.coordinates;
            // OSRM returns coordinates as [lng, lat], we need to flip for Leaflet
            const coordinates = routeGeometry.map(coord => [coord[1], coord[0]]);
            
            // Create a highlighted polyline for the next segment
            const polyline = L.polyline(coordinates, {
              color: '#FF0000', // Red color for the highlighted segment
              weight: 6,
              opacity: 0.9,
              lineJoin: 'round'
            }).addTo(map);
            
            nextSegmentRef.current = polyline;
          }
        }
        
        // Set loading to false after both routes are drawn
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching next segment route:', error);
        setIsLoading(false);
      }
    };
    
    // Set loading to true at the start
    setIsLoading(true);
    
    // Chain the promises to ensure they run in sequence
    fetchAndDrawFullRoute()
      .then(() => fetchAndDrawNextSegment())
      .catch(() => setIsLoading(false));
    
    // Clean up function
    return () => {
      if (routeRef.current && map) {
        map.removeLayer(routeRef.current);
      }
      if (nextSegmentRef.current && map) {
        map.removeLayer(nextSegmentRef.current);
      }
    };
  }, [map, stops, lastClearedStopIndex, nextStopIndex, currentPosition]);
  
  // Return loading overlay if routes are being fetched
  return isLoading ? (
    <div className="osrm-loading-overlay">
      <div className="osrm-loading-content">
        <div className="osrm-spinner"></div>
        <p>Updating route...</p>
      </div>
    </div>
  ) : null;
};

// Component to keep bus in view
const KeepBusInView = ({ position }) => {
  const map = useMap();
  const [lastPosition, setLastPosition] = useState(null);
  
  useEffect(() => {
    if (!position || !map) return;
    
    // Check if position has changed significantly
    if (lastPosition && 
        position[0] === lastPosition[0] && 
        position[1] === lastPosition[1]) {
      return; // Position hasn't changed, do nothing
    }
    
    setLastPosition(position);
    
    // Check if the bus is within the current map bounds
    const bounds = map.getBounds();
    const isInBounds = bounds.contains(position);
    
    // If the bus is outside the visible area, recenter the map
    if (!isInBounds) {
      //console.log('Bus moved outside visible area, recentering map');
      map.setView(position, map.getZoom());
    }
  }, [map, position, lastPosition]);
  
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

// Button to center map on driver's location
const LocationButton = ({ position, setCenter, busInfo }) => {
  // Remove mapZoom and setMapZoom that are causing unused variable warnings
  const map = useRef(null); // Use a ref instead of useMap() hook

  const handleClick = () => {
    if (position) {
      // If we have the driver's position, center on that with maximum zoom
      setCenter(position);
      // We'll now handle the zoom in the MapController component
      //console.log('Centering map on driver position with maximum zoom:', position);
    } else if (busInfo && busInfo.nextStop) {
      // Fall back to the next bus stop if driver position isn't available
      const nextStopPosition = [
        parseFloat(busInfo.nextStop.latitude),
        parseFloat(busInfo.nextStop.longitude)
      ];
      setCenter(nextStopPosition);
      //console.log('Centering map on next stop:', nextStopPosition);
    } else if (busInfo && busInfo.route && busInfo.route.length > 0) {
      // Fall back to the first stop in the route
      const firstStopPosition = [
        parseFloat(busInfo.route[0].latitude),
        parseFloat(busInfo.route[0].longitude)
      ];
      setCenter(firstStopPosition);
      //console.log('Centering map on first stop in route:', firstStopPosition);
    } else {
      // Default to IIT KGP location
      const defaultPosition = [22.3190, 87.3091];
      setCenter(defaultPosition);
      //console.log('Centering map on default location:', defaultPosition);
    }
  };
  
  // Always make the button clickable
  return (
    <button 
      className="location-button" 
      onClick={handleClick} 
      title={position ? "Center map on your location" : "Center map on route"}
    >
      <i className="fas fa-location-arrow"></i> {position ? "Your Location" : "Center Map"}
    </button>
  );
};

// Rename these components to indicate they're unused or add eslint-disable comments
// eslint-disable-next-line no-unused-vars
const UnusedClearStopButton = ({ busId, stopId, onStopCleared, isNextStop }) => {
  const [loading, setLoading] = useState(false);
  
  const handleClearStop = async () => {
    if (!busId || !stopId) return;
    
    try {
      setLoading(true);
      const response = await axios.post(
        getApiUrl('/driver/clear-stop'),
        { busId, stopId },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
          }
        }
      );
      
      if (response.data) {
        //console.log('Stop cleared successfully');
        if (onStopCleared) onStopCleared(response.data.data);
      }
    } catch (error) {
      console.error('Error clearing stop:', error);
      alert('Failed to mark stop as cleared. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isNextStop) return null;
  
  return (
    <button 
      className="clear-stop-button" 
      onClick={handleClearStop} 
      disabled={loading}
    >
      {loading ? 'Marking...' : 'Mark as Cleared'}
    </button>
  );
};

// eslint-disable-next-line no-unused-vars
const UnusedTurnNotification = ({ stops, currentPosition, lastClearedStopIndex, nextStopIndex }) => {
  const [showNotification, setShowNotification] = useState(false);
  const [turnDirection, setTurnDirection] = useState(null);
  const [distance, setDistance] = useState(null);
  const notificationRef = useRef(null);
  
  useEffect(() => {
    if (!stops || !currentPosition || lastClearedStopIndex === null || nextStopIndex === null) return;
    
    const lastStop = stops[lastClearedStopIndex];
    const nextStop = stops[nextStopIndex];
    
    // Calculate upcoming turns by comparing bearings
    const calculateTurn = () => {
      const currentPos = L.latLng(currentPosition);
      const lastStopPos = L.latLng(
        parseFloat(lastStop.latitude),
        parseFloat(lastStop.longitude)
      );
      const nextStopPos = L.latLng(
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      );
      
      // Calculate bearings
      const bearingToNext = calculateBearing(currentPos, nextStopPos);
      
      // Calculate distance to next stop
      const distanceToNext = currentPos.distanceTo(nextStopPos);
      setDistance(distanceToNext);
      
      // Determine if there's a turn coming up (within 100m)
      if (distanceToNext <= 100) {
        // Calculate current heading based on last few positions
        // This is simplified - ideally, you'd track recent positions to determine heading
        const currentHeading = calculateBearing(lastStopPos, currentPos);
        
        // Calculate angle between current heading and bearing to next stop
        const angle = Math.abs(bearingToNext - currentHeading);
        const normalizedAngle = angle > 180 ? 360 - angle : angle;
        
        // Determine turn direction based on angle
        if (normalizedAngle > 30 && normalizedAngle < 150) {
          if ((bearingToNext > currentHeading && bearingToNext - currentHeading < 180) || 
              (currentHeading > bearingToNext && currentHeading - bearingToNext > 180)) {
            setTurnDirection('right');
          } else {
            setTurnDirection('left');
          }
          
          // Show notification 5 seconds before turn (assume average speed of 5m/s)
          if (distanceToNext <= 25) {
            setShowNotification(true);
            
            // Hide notification 5 seconds after passing the turn
            const hideTimeout = setTimeout(() => {
              setShowNotification(false);
            }, 10000); // 5 seconds before + 5 seconds after = 10 seconds total
            
            return () => clearTimeout(hideTimeout);
          }
        } else {
          setTurnDirection('straight');
        }
      } else {
        setTurnDirection(null);
        setShowNotification(false);
      }
    };
    
    // Calculate turn every 1 second
    const interval = setInterval(calculateTurn, 1000);
    
    return () => clearInterval(interval);
  }, [stops, currentPosition, lastClearedStopIndex, nextStopIndex]);
  
  // Helper function to calculate bearing between two points
  const calculateBearing = (start, end) => {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;
    
    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
              Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    if (bearing < 0) bearing += 360;
    
    return bearing;
  };
  
  if (!showNotification) return null;
  
  // Render turn notification
  return (
    <div className="turn-notification" ref={notificationRef}>
      <div className="turn-icon">
        {turnDirection === 'left' && <i className="fas fa-arrow-left"></i>}
        {turnDirection === 'right' && <i className="fas fa-arrow-right"></i>}
        {turnDirection === 'straight' && <i className="fas fa-arrow-up"></i>}
      </div>
      <div className="turn-text">
        {turnDirection === 'left' && <p>Turn left in {Math.round(distance)} meters</p>}
        {turnDirection === 'right' && <p>Turn right in {Math.round(distance)} meters</p>}
        {turnDirection === 'straight' && <p>Continue straight for {Math.round(distance)} meters</p>}
      </div>
    </div>
  );
};

// Component to update next stop distance in the UI
const NextStopDistanceUpdater = ({ position, nextStop }) => {
  useEffect(() => {
    if (!position || !nextStop) return;

    const updateDistance = () => {
      const nextStopPosition = [
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      ];
      
      // Calculate distance between driver and next stop (in meters)
      const distance = L.latLng(position).distanceTo(L.latLng(nextStopPosition));
      
      // Update the distance display in the UI
      const distanceElement = document.getElementById('next-stop-distance');
      if (distanceElement) {
        distanceElement.textContent = `${Math.round(distance)} meters`;
      }
    };
    
    // Update immediately and then every second
    updateDistance();
    const interval = setInterval(updateDistance, 1000);
    
    return () => clearInterval(interval);
  }, [position, nextStop]);
  
  return null;
};

// Simplified permanent directions component
const PermanentDirections = ({ stops, currentPosition, lastClearedStopIndex, nextStopIndex }) => {
  const [direction, setDirection] = useState(null);
  const [distance, setDistance] = useState(null);
  
  useEffect(() => {
    if (!stops || !currentPosition || lastClearedStopIndex === null || nextStopIndex === null) return;
    
    // Use nextStop directly and remove reference to lastStop that isn't used
    const nextStop = stops[nextStopIndex];
    
    // Calculate heading and distance continuously
    const calculateDirections = () => {
      const currentPos = L.latLng(currentPosition);
      const nextStopPos = L.latLng(
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      );
      
      // Calculate distance to next stop
      const distanceToNext = currentPos.distanceTo(nextStopPos);
      setDistance(Math.round(distanceToNext));
      
      // Get route from current position to next stop using Leaflet routing
      // (This is a simplification - in a real app we'd use the OSRM route data)
      const bearing = calculateBearing(currentPos, nextStopPos);
      
      // Determine direction based on bearing
      if (bearing >= 337.5 || bearing < 22.5) {
        setDirection('north');
      } else if (bearing >= 22.5 && bearing < 67.5) {
        setDirection('northeast');
      } else if (bearing >= 67.5 && bearing < 112.5) {
        setDirection('east');
      } else if (bearing >= 112.5 && bearing < 157.5) {
        setDirection('southeast');
      } else if (bearing >= 157.5 && bearing < 202.5) {
        setDirection('south');
      } else if (bearing >= 202.5 && bearing < 247.5) {
        setDirection('southwest');
      } else if (bearing >= 247.5 && bearing < 292.5) {
        setDirection('west');
      } else {
        setDirection('northwest');
      }
    };
    
    // Calculate initially and then every second
    calculateDirections();
    const interval = setInterval(calculateDirections, 1000);
    
    return () => clearInterval(interval);
  }, [stops, currentPosition, lastClearedStopIndex, nextStopIndex]);
  
  // Helper function to calculate bearing between two points
  const calculateBearing = (start, end) => {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;
    
    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
              Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    if (bearing < 0) bearing += 360;
    
    return bearing;
  };
  
  // Always render the directions panel
  return (
    <div className="permanent-directions">
      <div className="direction-icon">
        {direction === 'north' && <i className="fas fa-arrow-up"></i>}
        {direction === 'northeast' && <i className="fas fa-arrow-up" style={{ transform: 'rotate(45deg)' }}></i>}
        {direction === 'east' && <i className="fas fa-arrow-right"></i>}
        {direction === 'southeast' && <i className="fas fa-arrow-down" style={{ transform: 'rotate(-45deg)' }}></i>}
        {direction === 'south' && <i className="fas fa-arrow-down"></i>}
        {direction === 'southwest' && <i className="fas fa-arrow-down" style={{ transform: 'rotate(45deg)' }}></i>}
        {direction === 'west' && <i className="fas fa-arrow-left"></i>}
        {direction === 'northwest' && <i className="fas fa-arrow-up" style={{ transform: 'rotate(-45deg)' }}></i>}
      </div>
      <div className="direction-text">
        <p>Head <strong>{direction}</strong> for {distance} meters</p>
        <p>Next stop: <strong>{stops[nextStopIndex].name}</strong></p>
      </div>
    </div>
  );
};

function DriverMapScreen() {
  const [position, setPosition] = useState(null);
  const [center, setCenter] = useState(null);
  const [zoom, setZoom] = useState(15); // Add zoom state
  const [busInfo, setBusInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  
  // For the map
  const mapRef = useRef(null);
  
  // Set up axios interceptor for JWT expiration
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && (error.response.status === 401 || error.response.data?.expired)) {
          //console.log('Authentication token expired or invalid. Redirecting to login.');
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
          navigate('/login');
        }
        return Promise.reject(error);
      }
    );
    
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [navigate]);
  
  // Fetch driver's bus info and route
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
        
        if (response.data && response.data.data) {
          setBusInfo(response.data.data);
          //console.log('Driver bus info loaded:', response.data.data);
        } else {
          setError('No bus assigned to you');
        }
      } catch (error) {
        console.error('Error fetching driver bus:', error);
        setError('Failed to load your bus information');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDriverBus();
    
    // Refresh bus info every 60 seconds
    const interval = setInterval(fetchDriverBus, 60000);
    
    return () => clearInterval(interval);
  }, []);  
  
  // Center map when position is first determined
  useEffect(() => {
    if (position && !center) {
      setCenter(position);
    }
  }, [position, center]);
  
  // Handle stop reached automatically (replaces manual clearing)
  const handleStopReached = async (busId, stopId) => {
    try {
      const response = await axios.post(
        getApiUrl('/driver/clear-stop'),
        { busId, stopId },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
          }
        }
      );
      
      if (response.data) {
        //console.log('Stop cleared automatically');
        
        // Update the local state with the new stops_cleared value
        setBusInfo(prev => ({
          ...prev,
          bus: response.data.data,
          stopsCleared: parseInt(response.data.data.stops_cleared)
        }));
        
        // Refresh the bus info to get updated last/next stop
        const fetchDriverBus = async () => {
          try {
            const response = await axios.get(
              getApiUrl('/driver/my-bus'),
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
                }
              }
            );
            
            if (response.data && response.data.data) {
              setBusInfo(response.data.data);
            }
          } catch (error) {
            console.error('Error refreshing driver bus info:', error);
          }
        };
        
        fetchDriverBus();
      }
    } catch (error) {
      console.error('Error auto-clearing stop:', error);
    }
  };
  
  // Find indices for last cleared stop and next stop
  const getStopIndices = () => {
    if (!busInfo || !busInfo.route || busInfo.route.length === 0) {
      return { lastClearedStopIndex: null, nextStopIndex: null };
    }
    
    const stops = busInfo.route;
    const stopsCleared = busInfo.stopsCleared || 0;
    
    // If stopsCleared is 0, the last cleared stop is the last one in the route (circular)
    // and the next stop is the first in the route
    if (stopsCleared === 0) {
      return {
        lastClearedStopIndex: stops.length - 1,
        nextStopIndex: 0
      };
    }
    
    // Normalize stopsCleared to be within the route length (for circular routes)
    const normalizedStopsCleared = stopsCleared % stops.length;
    
    return {
      lastClearedStopIndex: normalizedStopsCleared - 1,
      nextStopIndex: normalizedStopsCleared % stops.length
    };
  };
  
  const { lastClearedStopIndex, nextStopIndex } = getStopIndices();  
  
  // If still loading, show a spinner
  if (loading) {
    return (
      <div className="driver-map-loading">
        <div className="spinner"></div>
        <p>Loading your bus information...</p>
      </div>
    );
  }
  
  // If there's an error, show error message
  if (error) {
    return (
      <div className="driver-map-error driver-map-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }
  
  // If no bus assigned, show message
  if (!busInfo || !busInfo.bus) {
    return (
      <div className="driver-map-error driver-map-container">
        <h2>No Bus Assigned</h2>
        <p>You do not have a bus assigned to you. Please contact an administrator.</p>
      </div>
    );
  }
  
  // Function to set both center and zoom at the same time
  const handleCenterMap = (newCenter) => {
    setCenter(newCenter);
    setZoom(19); // Set maximum zoom when centering
  };
  
  return (
    <div className="driver-map-screen">
      <div className="driver-map-container">
        <MapContainer
          center={center || [22.3190, 87.3091]} // Default to IIT KGP if no position yet
          zoom={zoom} // Use zoom state instead of hard-coded value
          className="driver-map"
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Map controller to center map */}
          <MapController center={center} zoom={zoom} />
          
          {/* Driver location tracker */}
          <DriverLocationTracker setPosition={setPosition} />
          
          {/* Keep bus in view component */}
          {position && (
            <KeepBusInView position={position} />
          )}
          
          {/* Location updater component */}
          {position && busInfo && (
            <LocationUpdater
              driverId={localStorage.getItem('userId')}
              busId={busInfo.bus.id}
              position={position}
            />
          )}
          
          {/* Proximity detector for auto-clearing stops */}
          {position && busInfo && busInfo.nextStop && (
            <ProximityDetector
              busId={busInfo.bus.id}
              position={position}
              nextStop={busInfo.nextStop}
              onStopReached={handleStopReached}
            />
          )}
          
          {/* Driver marker */}
          {position && (
            <Marker position={position} icon={busIcon}>
              <Popup>
                <div className="driver-popup">
                  <strong>Your Location (Bus {busInfo.bus.name})</strong>
                  <p>You are here.</p>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Show all stops in the route */}
          {busInfo && busInfo.route && busInfo.route.map((stop, index) => (
            <Marker
              key={stop.id}
              position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
              icon={index === nextStopIndex ? nextStopIcon : busStopIcon}
            >
              <Popup>
                <div className="stop-popup">
                  <strong>{stop.name}</strong>
                  <p>Stop #{index + 1} in route</p>
                  {index === nextStopIndex && (
                    <p className="next-stop-label">This is your next stop</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
          
          {/* OSRM routes */}
          {busInfo && busInfo.route && position && (
            <OsrmRoutes
              stops={busInfo.route}
              currentPosition={position}
              lastClearedStopIndex={lastClearedStopIndex}
              nextStopIndex={nextStopIndex}
            />
          )}
          
          {/* Distance updater for next stop */}
          {position && busInfo && busInfo.nextStop && (
            <NextStopDistanceUpdater
              position={position}
              nextStop={busInfo.nextStop}
            />
          )}
          
          {/* Location button outside map - moved inside MapContainer to fix the context error */}
          <div className="location-button-container">
            <button 
              className="location-button" 
              onClick={() => handleCenterMap(position || 
                (busInfo && busInfo.nextStop ? 
                  [parseFloat(busInfo.nextStop.latitude), parseFloat(busInfo.nextStop.longitude)] : 
                  (busInfo && busInfo.route && busInfo.route.length > 0 ? 
                    [parseFloat(busInfo.route[0].latitude), parseFloat(busInfo.route[0].longitude)] : 
                    [22.3190, 87.3091])))} 
              title={position ? "Center map on your location" : "Center map on route"}
            >
              <i className="fas fa-location-arrow"></i> {position ? "Your Location" : "Center Map"}
            </button>
          </div>
        </MapContainer>
        
        {/* Permanent directions panel */}
        {busInfo && busInfo.route && position && (
          <PermanentDirections
            stops={busInfo.route}
            currentPosition={position}
            lastClearedStopIndex={lastClearedStopIndex}
            nextStopIndex={nextStopIndex}
          />
        )}
        
        {/* Bus info panel */}
        <div className="bus-info-panel">
          <h3>Bus: {busInfo.bus.name}</h3>
          {busInfo.nextStop && (
            <div className="next-stop-info">
              <p><strong>Next Stop:</strong> {busInfo.nextStop.name}</p>
              <p><strong>Distance:</strong> <span id="next-stop-distance">Calculating...</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DriverMapScreen;
