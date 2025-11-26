import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

function Sidebar({ communities = [] }) {
  const { user } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-card card">
        <div className="sidebar-header">
          <h3>About Uni-post</h3>
        </div>
        <div className="sidebar-content">
          <p>Uni-post is a community platform created by Sirco. Share posts, join communities, and connect with others!</p>
          <Link to="/create-community" className="btn btn-primary sidebar-btn">
            Create Community
          </Link>
          <Link to="/submit" className="btn btn-secondary sidebar-btn">
            Create Post
          </Link>
          {user && user.username === 'timco' && (
            <Link to="/admin" className="btn sidebar-btn" style={{ backgroundColor: '#000', color: '#fff', marginTop: '8px' }}>
              🦄 Admin Panel
            </Link>
          )}
        </div>
      </div>

      {communities.length > 0 && (
        <div className="sidebar-card card">
          <div className="sidebar-header">
            <h3>Top Communities</h3>
          </div>
          <div className="sidebar-content">
            <ul className="community-list">
              {communities.slice(0, 5).map((community, index) => (
                <li key={community.name} className="community-item">
                  <span className="community-rank">{index + 1}</span>
                  <Link to={`/r/${community.name}`} className="community-link">
                    {community.iconUrl ? (
                      <img src={community.iconUrl} alt="" className="sidebar-community-icon" />
                    ) : (
                      <span className="community-icon">🏠</span>
                    )}
                    <span className="community-name">r/{community.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="sidebar-card card">
        <div className="sidebar-content footer-links">
          <p>© 2025 Uni-post by Sirco</p>
          <p>The Open Data Social Platform</p>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
