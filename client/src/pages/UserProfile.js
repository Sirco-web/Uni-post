import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './UserProfile.css';

function UserProfile() {
  const { username } = useParams();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('posts');

  useEffect(() => {
    fetchUser();
  }, [username]);

  const fetchUser = async () => {
    try {
      const response = await fetch(`/api/u/${username}`);
      if (response.ok) {
        const data = await response.json();
        setUserData(data);
      } else {
        setError('User not found');
      }
    } catch (err) {
      setError('Error loading user');
    }
    setLoading(false);
  };

  const timeAgo = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-page">
        <h2>u/{username}</h2>
        <p>{error}</p>
        <Link to="/" className="btn btn-primary">Go Home</Link>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      <div className="page-container">
        <div className="feed-container">
          <div className="profile-tabs card">
            <button 
              className={`profile-tab ${activeTab === 'posts' ? 'active' : ''}`}
              onClick={() => setActiveTab('posts')}
            >
              Posts
            </button>
            <button 
              className={`profile-tab ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              Comments
            </button>
          </div>

          {activeTab === 'posts' && (
            userData.posts.length > 0 ? (
              <div className="user-posts">
                {userData.posts.map((postId) => (
                  <div key={postId} className="user-post-item card">
                    <p>Post ID: {postId}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state card">
                <h3>No posts yet</h3>
                <p>u/{username} hasn't posted anything yet.</p>
              </div>
            )
          )}

          {activeTab === 'comments' && (
            userData.comments.length > 0 ? (
              <div className="user-comments">
                {userData.comments.map((comment, index) => (
                  <div key={index} className="user-comment-item card">
                    <p>Comment on post: {comment.postId}</p>
                    <p className="comment-date">{timeAgo(comment.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state card">
                <h3>No comments yet</h3>
                <p>u/{username} hasn't commented anything yet.</p>
              </div>
            )
          )}
        </div>

        <aside className="sidebar">
          <div className="sidebar-card card">
            <div className="sidebar-header user-header">
              <div className="user-avatar-large">👤</div>
            </div>
            <div className="sidebar-content">
              <h2 className="profile-username">u/{userData.username}</h2>
              <div className="profile-stats">
                <div className="profile-stat">
                  <span className="stat-value">{userData.karma}</span>
                  <span className="stat-label">Karma</span>
                </div>
                <div className="profile-stat">
                  <span className="stat-value">{userData.posts.length}</span>
                  <span className="stat-label">Posts</span>
                </div>
              </div>
              <p className="profile-joined">
                📅 Joined {timeAgo(userData.createdAt)}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default UserProfile;
