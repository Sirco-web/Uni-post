import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Comment from '../components/Comment';
import './PostPage.css';

function PostPage() {
  const { community, postId } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userVote, setUserVote] = useState(0);

  const fetchPost = useCallback(async () => {
    try {
      const response = await fetch(`/api/r/${community}/posts/${postId}`);
      if (response.ok) {
        const data = await response.json();
        setPost(data);
      } else {
        setError('Post not found');
      }
    } catch (err) {
      setError('Error loading post');
    }
    setLoading(false);
  }, [community, postId]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  const handleVote = async (vote) => {
    if (!user) return;

    const newVote = userVote === vote ? 0 : vote;
    
    try {
      const response = await fetch(`/api/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, vote: newVote })
      });

      if (response.ok) {
        const data = await response.json();
        setPost(prev => ({ ...prev, score: data.score }));
        setUserVote(newVote);
      }
    } catch (err) {
      console.error('Vote error:', err);
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentContent.trim() || !user) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: commentContent,
          author: user.username
        })
      });

      if (response.ok) {
        setCommentContent('');
        fetchPost();
      }
    } catch (err) {
      console.error('Comment error:', err);
    }
    setIsSubmitting(false);
  };

  const timeAgo = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return new Date(dateString).toLocaleDateString();
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
        <h2>Oops!</h2>
        <p>{error}</p>
        <Link to="/" className="btn btn-primary">Go Home</Link>
      </div>
    );
  }

  return (
    <div className="post-page">
      <div className="post-page-container">
        <div className="post-full card">
          <div className="post-votes">
            <button 
              className={`vote-btn upvote ${userVote === 1 ? 'active' : ''}`}
              onClick={() => handleVote(1)}
              disabled={!user}
            >
              ▲
            </button>
            <span className="vote-count">{post.score}</span>
            <button 
              className={`vote-btn downvote ${userVote === -1 ? 'active' : ''}`}
              onClick={() => handleVote(-1)}
              disabled={!user}
            >
              ▼
            </button>
          </div>

          <div className="post-main">
            <div className="post-meta">
              <Link to={`/r/${post.community}`} className="post-community">
                r/{post.community}
              </Link>
              <span className="separator">•</span>
              <span className="post-author">
                Posted by <Link to={`/u/${post.author}`}>u/{post.author}</Link>
              </span>
              <span className="separator">•</span>
              <span className="post-time">{timeAgo(post.createdAt)}</span>
            </div>

            <h1 className="post-title">{post.title}</h1>

            {post.content && (
              <div className="post-body-full">
                <p>{post.content}</p>
              </div>
            )}

            <div className="post-actions">
              <span className="post-action">
                <span>💬</span> {post.commentCount} Comments
              </span>
              <button className="post-action">
                <span>🔗</span> Share
              </button>
              <button className="post-action">
                <span>💾</span> Save
              </button>
            </div>
          </div>
        </div>

        {user && (
          <div className="comment-form-container card">
            <p className="comment-as">
              Comment as <Link to={`/u/${user.username}`}>{user.username}</Link>
            </p>
            <form onSubmit={handleSubmitComment}>
              <textarea
                className="textarea comment-textarea"
                placeholder="What are your thoughts?"
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
              />
              <div className="comment-form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!commentContent.trim() || isSubmitting}
                >
                  {isSubmitting ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="comments-section card">
          {post.comments && post.comments.length > 0 ? (
            post.comments.map((comment) => (
              <Comment 
                key={comment.id} 
                comment={comment} 
                postId={postId}
                onReply={fetchPost}
              />
            ))
          ) : (
            <div className="no-comments">
              <p>No comments yet. Be the first to share your thoughts!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PostPage;
