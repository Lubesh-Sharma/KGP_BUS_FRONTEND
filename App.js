import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './css/authStyles.css';

import Home from './components/Home';
import Header from './components/Header';
import Footer from './components/Footer';
import Login from './components/login';
import Register from './components/signup';
import Driver from './components/driver_pages/driver';
import User from './components/user_pages/user';
import About from './components/About';
import AdminDashboard from './components/admin/AdminDashboard';
import MyLocation from './components/admin/MyLocation';
import BusTracker from './components/admin/BusTracker';
import UserProfile from './components/profile/UserProfile';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_API_URL;
axios.defaults.withCredentials = true;

// Protected Route Component - Only check auth for protected routes
const ProtectedRoute = ({ children, allowedRoles }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      const token = localStorage.getItem('jwtToken');

      if (!token) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${BACKEND_URL}/authenticate`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          withCredentials: true
        });

        if (response.status === 200) {
          setIsAuthenticated(true);
          setUserRole(response.data.user.role);
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Auth verification failed:', error);
        setIsAuthenticated(false);
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" />;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('jwtToken');
      const storedUser = localStorage.getItem('user');
      
      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          
          // Verify token is valid
          const response = await axios.get(`${BACKEND_URL}/authenticate`, {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            withCredentials: true
          });
          
          if (response.status === 200) {
            // Update user with fresh data
            setUser(response.data.user);
          }
        } catch (error) {
          console.error("Token verification failed:", error);
          // Clear invalid tokens
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
    };

    verifyToken();
  }, []);

  const updateUser = (userData) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('user');
    }
  };

  // Check if user is logged in for conditional rendering
  const isLoggedIn = !!user;

  return (
    <Router>
      <Header user={user} updateUser={updateUser} />
      <Routes>
        {/* Public routes - no authentication check */}
        <Route path="/" element={isLoggedIn ? <Navigate to={`/logged_in/${user.role}/${user.id}`} /> : <Home />} />
        <Route path="/login" element={isLoggedIn ? <Navigate to={`/logged_in/${user.role}/${user.id}`} /> : <Login setUser={updateUser} />} />
        <Route path="/signup" element={isLoggedIn ? <Navigate to={`/logged_in/${user.role}/${user.id}`} /> : <Register setUser={updateUser} />} />
        <Route path="/about" element={<About />} />

        {/* Protected routes with role-based access */}
        <Route path="/logged_in/admin/:id" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        <Route path="/logged_in/driver/:id" element={
          <ProtectedRoute allowedRoles={['driver']}>
            <Driver />
          </ProtectedRoute>
        } />

        <Route path="/logged_in/user/:id" element={
          <ProtectedRoute allowedRoles={['user']}>
            <User />
          </ProtectedRoute>
        } />
        
        <Route path="/profile/:id" element={
          <ProtectedRoute>
            <UserProfile />
          </ProtectedRoute>
        } />
        
        <Route
          path="/mylocation"
          element={
            <ProtectedRoute>
              <MyLocation user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/buses"
          element={
            <ProtectedRoute>
              <BusTracker user={user} />
            </ProtectedRoute>
          }
        />
      </Routes>
      <Footer />
    </Router>
  );
}
export default App;