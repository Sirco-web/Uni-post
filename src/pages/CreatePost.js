import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './CreatePost.css';

function CreatePost() {
  const { community: urlCommunity } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [community, setCommunity] = useState(urlCommunity || '');
  const [communities, setCommunities] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchCommunities();
  }, [user, navigate]);

  const fetchCommunities = async () => {
    try {
      const response = await fetch('/api/communities');
      if (response.ok) {
        const data = await response.json();
        setCommunities(data);
      }
    } catch (err) {
      console.error('Error fetching communities:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!community) {
      setError('Please select a community');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/r/${community}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          author: user.username
        })
      });

      if (response.ok) {
        const post = await response.json();
        navigate(`/r/${community}/posts/${post.id}`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create post');
      }
    } catch (err) {
      setError('Error creating post');
    }

    setIsSubmitting(false);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="create-post-page">
      <div className="create-post-container">
        <h1>Create a post</h1>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <select
              className="input community-select"
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
            >
              <option value="">Choose a community</option>
              {communities.map((c) => (
                <option key={c.name} value={c.name}>
                  r/{c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="post-form card">
            <div className="form-group">
              <input
                type="text"
                className="input title-input"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
              />
              <span className="char-count">{title.length}/300</span>
            </div>

            <div className="form-group">
              <textarea
                className="textarea content-textarea"
                placeholder="Text (optional)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate(-1)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || !title.trim() || !community}
              >
                {isSubmitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePost;
