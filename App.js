import React, { useEffect, useState } from "react";
import axios from "axios";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";

// Determine backend URL
const API_BASE_URL = process.env.REACT_APP_API_URL;

function Home() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    axios.get(`${API_BASE_URL}/`)
      .then(res => setMessage(res.data.message))
      .catch(err => console.error("Error fetching data:", err));
  }, []);

  return (
    <div>
      <h1>{message || "Welcome to KGP Bus Service"}</h1>
      <div>
        <Link to="/login">
          <button>Login</button>
        </Link>
        <Link to="/signup">
          <button>Sign Up</button>
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Other routes will be handled by your existing components */}
      </Routes>
    </Router>
  );
}

export default App;