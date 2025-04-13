import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Default position for KGP (approximately IIT Kharagpur coordinates)
const DEFAULT_POSITION = {
  latitude: 22.3149, 
  longitude: 87.3104
};

function MyLocation({ user }) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [usingDefault, setUsingDefault] = useState(false);
  const mapRef = useRef();
  
  // Use useCallback to memoize the updateLocationToServer function
  const updateLocationToServer = useCallback(async (position) => {
    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/location/update`,
        {
          latitude: position.latitude,
          longitude: position.longitude,
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        }
      );
    } catch (err) {
      console.error('Error updating location:', err);
    }
  }, [user.token]);
  
  // Manual location input
  const handleManualLocationInput = useCallback((e) => {
    e.preventDefault();
    const manualLatitude = parseFloat(document.getElementById('manual-lat').value);
    const manualLongitude = parseFloat(document.getElementById('manual-lng').value);
    
    if (!isNaN(manualLatitude) && !isNaN(manualLongitude)) {
      const manualPosition = {
        latitude: manualLatitude,
        longitude: manualLongitude
      };
      setPosition(manualPosition);
      updateLocationToServer(manualPosition);
      setUsingDefault(false);
      setError('');
    } else {
      setError('Please enter valid latitude and longitude values.');
    }
  }, [updateLocationToServer]);
  
  useEffect(() => {
    // Get current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setPosition(newPosition);
          setIsLoading(false);
          updateLocationToServer(newPosition);
        },
        (err) => {
          console.error(`Geolocation error: ${err.message}`);
          setError(`Geolocation error: ${err.message}. Please use manual input below or access via localhost/HTTPS.`);
          setPosition(DEFAULT_POSITION);
          setUsingDefault(true);
          setIsLoading(false);
          updateLocationToServer(DEFAULT_POSITION);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } else {
      setError('Geolocation is not supported by your browser. Using default location.');
      setPosition(DEFAULT_POSITION);
      setUsingDefault(true);
      setIsLoading(false);
      updateLocationToServer(DEFAULT_POSITION);
    }
  }, [updateLocationToServer]);

  if (isLoading) {
    return <div>Loading your location...</div>;
  }

  return (
    <div>
      <h2 style={{ padding: '10px 20px' }}>My Current Location</h2>
      
      {error && (
        <div style={{ color: 'red', padding: '0 20px 20px' }}>
          {error}
        </div>
      )}
      
      {(usingDefault || error) && (
        <div style={{ padding: '0 20px 20px' }}>
          <h3>Enter Your Location Manually</h3>
          <form onSubmit={handleManualLocationInput}>
            <div style={{ marginBottom: '10px' }}>
              <label htmlFor="manual-lat" style={{ marginRight: '10px' }}>Latitude:</label>
              <input 
                type="text" 
                id="manual-lat" 
                defaultValue={position?.latitude || DEFAULT_POSITION.latitude}
                style={{ padding: '5px' }}
              />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label htmlFor="manual-lng" style={{ marginRight: '10px' }}>Longitude:</label>
              <input 
                type="text" 
                id="manual-lng" 
                defaultValue={position?.longitude || DEFAULT_POSITION.longitude}
                style={{ padding: '5px' }}
              />
            </div>
            <button type="submit">Update Location</button>
          </form>
        </div>
      )}
      
      {position && (
        <div>
          {usingDefault && (
            <div style={{ padding: '0 20px 10px', fontStyle: 'italic' }}>
              Using default or manually entered location
            </div>
          )}
          <MapContainer
            center={[position.latitude, position.longitude]}
            zoom={15}
            style={{ height: "calc(100vh - 250px)" }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[position.latitude, position.longitude]}>
              <Popup>
                {usingDefault ? 'Default or manually set location' : 'Your location'}<br />
                Lat: {position.latitude.toFixed(6)}<br />
                Lng: {position.longitude.toFixed(6)}
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default MyLocation;
