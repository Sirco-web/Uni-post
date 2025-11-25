import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Post from '../components/Post';
import './UserProfile.css';

function UserProfile() {
  const { username } = useParams();
  const { user, updateUser } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('posts');
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editAbout, setEditAbout] = useState('');

  useEffect(() => {
    fetchUser();
  }, [username]);

  const fetchUser = async () => {
    try {
      const response = await fetch(`/api/u/${username}`);
      if (response.ok) {
        const data = await response.json();
        setUserData(data);
        setEditAvatarUrl(data.avatarUrl || '');
        setEditAbout(data.about || '');
      } else {
        setError('User not found');
      }
    } catch (err) {
      setError('Error loading user');
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    try {
      const response = await fetch(`/api/u/${username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarUrl: editAvatarUrl,
          about: editAbout
        })
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUserData(updatedUser);
        setIsEditing(false);
        if (user && user.username === username) {
          updateUser(updatedUser);
        }
      }
    } catch (err) {
      console.error('Error updating profile:', err);
    }
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
                {userData.posts.map((post) => (
                  <Post key={post.id} post={post} showCommunity={true} />
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
              {userData.avatarUrl ? (
                <img src={userData.avatarUrl} alt={userData.username} className="user-avatar-large-img" />
              ) : (
                <div className="user-avatar-large">👤</div>
              )}
            </div>
            <div className="sidebar-content">
              <h2 className="profile-username">u/{userData.username}</h2>
              
              {isEditing ? (
                <div className="edit-profile-form">
                  <div className="form-group">
                    <label>Avatar URL</label>
                    <input 
                      type="text" 
                      className="input" 
                      value={editAvatarUrl}
                      onChange={(e) => setEditAvatarUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="form-group">
                    <label>About</label>
                    <textarea 
                      className="textarea" 
                      value={editAbout}
                      onChange={(e) => setEditAbout(e.target.value)}
                      placeholder="Tell us about yourself"
                      style={{minHeight: '80px'}}
                    />
                  </div>
                  <div className="edit-actions">
                    <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSaveProfile}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  {userData.about && <p className="profile-about">{userData.about}</p>}
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
                  {user && user.username === username && (
                    <button className="btn btn-secondary sidebar-btn" onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default UserProfile;
