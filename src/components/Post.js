import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Post.css';

function Post({ post, showCommunity = true }) {
  const { user } = useAuth();
  const [score, setScore] = React.useState(post.score);
  const [userVote, setUserVote] = React.useState(0);

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
          <button className="post-action">
            <span>🔗</span> Share
          </button>
          <button className="post-action">
            <span>💾</span> Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default Post;
