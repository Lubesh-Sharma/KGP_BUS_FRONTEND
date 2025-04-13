import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DriverMapScreen from './DriverMapScreen';
import '../../css/DriverPage.css';

function Driver() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Get user from localStorage
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('jwtToken');

    if (!token) {
      // No token, redirect to login
      navigate('/login');
      return;
    }

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser({ ...parsedUser, token });
      } catch (error) {
        console.error('Error parsing user data:', error);
        // Invalid user data, redirect to login
        localStorage.removeItem('user');
        localStorage.removeItem('jwtToken');
        navigate('/login');
      }
    } else {
      // No user data, redirect to login
      navigate('/login');
    }
  }, [id, navigate]);

  if (!user) {
    return <div className="loading-container">Loading...</div>;
  }

  return (
    <div className="driver-page">
      {/* Full screen map for driver */}
      <DriverMapScreen />
    </div>
  );
}

export default Driver;