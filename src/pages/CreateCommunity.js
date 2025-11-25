import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './CreateCommunity.css';

function CreateCommunity() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Community name is required');
      return;
    }

    if (name.length < 3) {
      setError('Community name must be at least 3 characters');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/r', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          creator: user.username
        })
      });

      if (response.ok) {
        const community = await response.json();
        navigate(`/r/${community.name}`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create community');
      }
    } catch (err) {
      setError('Error creating community');
    }

    setIsSubmitting(false);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="create-community-page">
      <div className="create-community-container card">
        <h1>Create a community</h1>
        <p className="subtitle">
          Build and grow a community about something you care about.
          We'll help you set it up.
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <p className="form-hint">
              Community names including capitalization cannot be changed.
            </p>
            <div className="name-input-wrapper">
              <span className="name-prefix">r/</span>
              <input
                type="text"
                className="input name-input"
                placeholder="community_name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={21}
              />
            </div>
            <span className="char-count">{name.length}/21</span>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <p className="form-hint">
              This is how members will know what your community is about.
            </p>
            <textarea
              className="textarea"
              placeholder="Tell us about your community"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !name.trim() || name.length < 3}
            >
              {isSubmitting ? 'Creating...' : 'Create Community'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateCommunity;
