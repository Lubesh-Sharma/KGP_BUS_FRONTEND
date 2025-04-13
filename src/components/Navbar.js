import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';

function Navbar({ user, setUser }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // Call backend logout endpoint
      await api.post('/logout');
      
      // Clear local storage
      localStorage.removeItem('jwtToken');
      localStorage.removeItem('user');
      
      // Update state
      setUser(null);
      
      // Redirect to home page
      navigate('/');
    } catch (error) {
      console.error("Logout failed", error);
      
      // Even if the backend logout fails, clear local state
      localStorage.removeItem('jwtToken');
      localStorage.removeItem('user');
      setUser(null);
      navigate('/');
    }
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
      <div className="container">
        <Link className="navbar-brand" to="/">KGP Bus Tracker</Link>
        
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto">
            {user ? (
              <>
                <li className="nav-item">
                  <span className="nav-link">Welcome, {user.username}</span>
                </li>
                
                {/* Role-based navigation items */}
                {user.role === 'admin' && (
                  <li className="nav-item">
                    <Link className="nav-link" to={`/logged_in/admin/${user.id}`}>Admin Dashboard</Link>
                  </li>
                )}
                
                {user.role === 'driver' && (
                  <li className="nav-item">
                    <Link className="nav-link" to={`/logged_in/driver/${user.id}`}>Driver Dashboard</Link>
                  </li>
                )}
                
                {user.role === 'user' && (
                  <li className="nav-item">
                    <Link className="nav-link" to={`/logged_in/user/${user.id}`}>My Dashboard</Link>
                  </li>
                )}
                
                <li className="nav-item">
                  <button 
                    className="nav-link btn btn-link" 
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </li>
              </>
            ) : (
              <>
                <li className="nav-item">
                  <Link className="nav-link" to="/login">Login</Link>
                </li>
                <li className="nav-item">
                  <Link className="nav-link" to="/signup">Register</Link>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
