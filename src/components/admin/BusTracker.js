import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import axios from 'axios';
import api, { getApiUrl } from '../../utils/api2.js';
import L from 'leaflet';

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom bus icon
const busIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/30/30979.png',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

function BusTracker({ user }) {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [mapCenter] = useState([22.3190, 87.3091]); // Default to IIT KGP

  useEffect(() => {
    // Fetch routes first
    const fetchRoutes = async () => {
      try {
        const response = await axios.get(getApiUrl(api.endpoints.allRoutes), {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        
        if (response.data && Array.isArray(response.data)) {
          setRoutes(response.data);
        } else {
          //console.log("No routes data available");
        }
      } catch (err) {
        setError('Failed to fetch routes: ' + (err.response?.data?.message || err.message));
      }
    };

    fetchRoutes();
    fetchBuses();

    // Set up interval to fetch bus locations every 10 seconds
    const interval = setInterval(fetchBuses, 10000);
    
    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, [user.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBuses = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await axios.get(getApiUrl(api.endpoints.busLocations), {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      if (response.data && Array.isArray(response.data)) {
        //console.log("Bus locations fetched:", response.data.length);
        setBuses(response.data);
      } else {
        //console.log("No bus location data available");
        setBuses([]);
      }
    } catch (err) {
      setError('Failed to fetch bus locations: ' + (err.response?.data?.message || err.message));
      console.error("Error fetching bus locations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRouteSelect = async (routeId) => {
    setSelectedRoute(routeId);
    // Additional logic to filter buses by route if needed
  };

  if (loading && !buses.length) {
    return <div>Loading bus locations...</div>;
  }

  return (
    <div className="bus-tracker">
      <h2>Live Bus Tracking</h2>
      {error && <div className="error-message">{error}</div>}
      
      <div className="route-filter">
        <label htmlFor="route-select">Filter by Route:</label>
        <select
          id="route-select"
          value={selectedRoute || ''}
          onChange={(e) => handleRouteSelect(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">All Routes</option>
          {routes.map(route => (
            <option key={route.id} value={route.id}>{route.name}</option>
          ))}
        </select>
      </div>
      
      <div className="bus-map-container">
        <MapContainer
          center={mapCenter}
          zoom={15}
          style={{ height: "500px", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {buses.length > 0 ? (
            buses.map(bus => (
              <Marker
                key={bus.id}
                position={[bus.location.latitude, bus.location.longitude]}
                icon={busIcon}
              >
                <Popup>
                  <div>
                    <h3>{bus.name}</h3>
                    <p>Last updated: {new Date(bus.timestamp).toLocaleString()}</p>
                  </div>
                </Popup>
              </Marker>
            ))
          ) : (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: 'white', padding: '10px', borderRadius: '5px' }}>
              No active buses found
            </div>
          )}
        </MapContainer>
      </div>
      
      <div className="bus-list">
        <h3>Active Buses</h3>
        {buses.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Bus</th>
                <th>Last Updated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {buses.map(bus => (
                <tr key={bus.id}>
                  <td>{bus.name}</td>
                  <td>{new Date(bus.timestamp).toLocaleString()}</td>
                  <td>
                    <span className="status-active">Active</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No active buses found. Please check back later.</p>
        )}
      </div>
    </div>
  );
}

export default BusTracker;
