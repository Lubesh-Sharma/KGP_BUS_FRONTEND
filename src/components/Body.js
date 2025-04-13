import React from 'react';
import { Link } from 'react-router-dom';
import '../css/Body.css';
import backgroundVideo from './vid.mp4'; 

function Body() {
  return (
    <main className="body-container">
      <div className="video-background">
        <video autoPlay loop muted playsInline>
          <source src={backgroundVideo} type="video/mp4" />
          Your browser does not support background video.
        </video>
        
        <div className="overlay"></div>
        
        <div className="content">
          <div className="description">
            <h1>Welcome to KGP_BUS</h1>
            <p>Your reliable transportation service on campus. Travel with comfort and safety.</p>
          </div>
          
          <div className="action-buttons">
            <Link to="/login" className="btn btn-login">Login</Link>
            <Link to="/signup" className="btn btn-signup">Sign Up</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default Body;