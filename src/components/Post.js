import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Post.css';

function Post({ post, showCommunity = true }) {
  const { user, updateUser } = useAuth();
  const [score, setScore] = useState(post.score);
  const [userVote, setUserVote] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);

  useEffect(() => {
    if (user && user.savedPosts) {
      setIsSaved(user.savedPosts.includes(post.id));
    }
    if (post.voters && user) {
      setUserVote(post.voters[user.username] || 0);
    }
  }, [user, post]);

  const handleVote = async (vote) => {
    if (!user) return;

    const newVote = userVote === vote ? 0 : vote;
    
    try {
      const response = await fetch(`/api/posts/${post.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, vote: newVote })
      });

      if (response.ok) {
        const data = await response.json();
        setScore(data.score);
        setUserVote(newVote);
      }
    } catch (error) {
      console.error('Vote error:', error);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/users/${user.username}/save/${post.id}`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        setIsSaved(data.saved);
        updateUser({ savedPosts: data.savedPosts });
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/r/${post.community}/posts/${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShowShareTooltip(true);
      setTimeout(() => setShowShareTooltip(false), 2000);
    });
  };

  const timeAgo = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="post card">
      <div className="post-votes">
        <button 
          className={`vote-btn upvote ${userVote === 1 ? 'active' : ''}`}
          onClick={() => handleVote(1)}
          disabled={!user}
        >
          ▲
        </button>
        <span className="vote-count">{score}</span>
        <button 
          className={`vote-btn downvote ${userVote === -1 ? 'active' : ''}`}
          onClick={() => handleVote(-1)}
          disabled={!user}
        >
          ▼
        </button>
      </div>

      <div className="post-content">
        <div className="post-meta">
          {showCommunity && (
            <>
              <Link to={`/r/${post.community}`} className="post-community">
                r/{post.community}
              </Link>
              <span className="separator">•</span>
            </>
          )}
          <span className="post-author">
            Posted by <Link to={`/u/${post.author}`}>u/{post.author}</Link>
          </span>
          <span className="separator">•</span>
          <span className="post-time">{timeAgo(post.createdAt)}</span>
        </div>

        <Link to={`/r/${post.community}/posts/${post.id}`} className="post-title-link">
          <h3 className="post-title">{post.title}</h3>
        </Link>

        {post.content && (
          <div className="post-body">
            <p>{post.content.slice(0, 300)}{post.content.length > 300 ? '...' : ''}</p>
          </div>
        )}

        <div className="post-actions">
          <Link to={`/r/${post.community}/posts/${post.id}`} className="post-action">
            <span>💬</span> {post.commentCount} Comments
          </Link>
          <button className="post-action" onClick={handleShare} style={{position: 'relative'}}>
            <span>🔗</span> Share
            {showShareTooltip && <span className="share-tooltip">Copied!</span>}
          </button>
          <button 
            className={`post-action ${isSaved ? 'active' : ''}`} 
            onClick={handleSave}
            disabled={!user}
          >
            <span>{isSaved ? '💾' : '🔖'}</span> {isSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Post;
