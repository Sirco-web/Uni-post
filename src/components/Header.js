import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Header.css';

function Header() {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // For now, search redirects to a community
      navigate(`/r/${searchQuery.trim()}`);
      setSearchQuery('');
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <div className="logo-icon">📮</div>
          <span className="logo-text">uni-post</span>
        </Link>

        <form className="search-bar" onSubmit={handleSearch}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search Uni-post"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>

        <nav className="header-nav">
          {user ? (
            <>
              <Link to="/submit" className="btn btn-ghost header-btn">
                <span>➕</span>
                <span className="btn-label">Create Post</span>
              </Link>
              
              <div className="user-menu-container">
                <button 
                  className="user-menu-trigger"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                >
                  <div className="user-avatar">👤</div>
                  <span className="username">{user.username}</span>
                  <span className="dropdown-arrow">▼</span>
                </button>
                
                {showUserMenu && (
                  <div className="user-menu">
                    <Link 
                      to={`/u/${user.username}`}
                      className="user-menu-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <span>👤</span> Profile
                    </Link>
                    <Link 
                      to="/create-community"
                      className="user-menu-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <span>🏠</span> Create Community
                    </Link>
                    <div className="user-menu-divider"></div>
                    <button 
                      className="user-menu-item"
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                      }}
                    >
                      <span>🚪</span> Log Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary">Log In</Link>
              <Link to="/register" className="btn btn-primary">Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;
