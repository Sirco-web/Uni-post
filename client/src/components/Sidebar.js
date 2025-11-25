import React from 'react';
import { Link } from 'react-router-dom';
import './Sidebar.css';

function Sidebar({ communities = [] }) {
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
                    <span className="community-icon">🏠</span>
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
          <p>© 2024 Uni-post by Sirco</p>
          <p>All data stored in GitHub</p>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
