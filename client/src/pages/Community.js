import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Post from '../components/Post';
import './Community.css';

function Community() {
  const { community } = useParams();
  const { user } = useAuth();
  const [communityData, setCommunityData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('new');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    fetchCommunity();
    fetchPosts();
  }, [community, sort]);

  useEffect(() => {
    if (communityData && user) {
      setJoined(communityData.members?.includes(user.username));
    }
  }, [communityData, user]);

  const fetchCommunity = async () => {
    try {
      const response = await fetch(`/api/r/${community}`);
      if (response.ok) {
        const data = await response.json();
        setCommunityData(data);
      } else {
        setError('Community not found');
      }
    } catch (error) {
      setError('Error loading community');
    }
  };

  const fetchPosts = async () => {
    try {
      const response = await fetch(`/api/r/${community}/posts?sort=${sort}`);
      if (response.ok) {
        const data = await response.json();
        setPosts(data);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/r/${community}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });

      if (response.ok) {
        setJoined(true);
        fetchCommunity();
      }
    } catch (error) {
      console.error('Error joining community:', error);
    }
  };

  if (error) {
    return (
      <div className="error-page">
        <h2>r/{community}</h2>
        <p>{error}</p>
        <Link to="/" className="btn btn-primary">Go Home</Link>
      </div>
    );
  }

  return (
    <div className="community-page">
      <div className="community-banner">
        <div className="community-banner-inner"></div>
      </div>

      <div className="community-header">
        <div className="community-header-content">
          <div className="community-icon">🏠</div>
          <div className="community-info">
            <h1>r/{community}</h1>
            {communityData && (
              <p className="community-subtitle">{communityData.displayName}</p>
            )}
          </div>
          {user && (
            <button 
              className={`btn ${joined ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleJoin}
              disabled={joined}
            >
              {joined ? 'Joined' : 'Join'}
            </button>
          )}
        </div>
      </div>

      <div className="page-container">
        <div className="feed-container">
          <div className="feed-header card">
            <div className="sort-tabs">
              <button 
                className={`sort-tab ${sort === 'hot' ? 'active' : ''}`}
                onClick={() => setSort('hot')}
              >
                🔥 Hot
              </button>
              <button 
                className={`sort-tab ${sort === 'new' ? 'active' : ''}`}
                onClick={() => setSort('new')}
              >
                ✨ New
              </button>
              <button 
                className={`sort-tab ${sort === 'top' ? 'active' : ''}`}
                onClick={() => setSort('top')}
              >
                📈 Top
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          ) : posts.length > 0 ? (
            posts.map((post) => (
              <Post key={post.id} post={post} showCommunity={false} />
            ))
          ) : (
            <div className="empty-state card">
              <h3>No posts in this community yet</h3>
              <p>Be the first to post something!</p>
              {user && (
                <Link to={`/r/${community}/submit`} className="btn btn-primary">
                  Create Post
                </Link>
              )}
            </div>
          )}
        </div>

        <aside className="sidebar">
          {communityData && (
            <div className="sidebar-card card">
              <div className="sidebar-header">
                <h3>About Community</h3>
              </div>
              <div className="sidebar-content">
                <p>{communityData.description || 'No description available.'}</p>
                <div className="community-stats">
                  <div className="stat">
                    <span className="stat-value">{communityData.memberCount}</span>
                    <span className="stat-label">Members</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{posts.length}</span>
                    <span className="stat-label">Posts</span>
                  </div>
                </div>
                <p className="created-date">
                  Created {new Date(communityData.createdAt).toLocaleDateString()}
                </p>
                {user && (
                  <Link to={`/r/${community}/submit`} className="btn btn-primary sidebar-btn">
                    Create Post
                  </Link>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default Community;
