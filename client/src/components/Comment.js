import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Comment.css';

function Comment({ comment, postId, onReply }) {
  const { user } = useAuth();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timeAgo = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return new Date(dateString).toLocaleDateString();
  };

  const handleSubmitReply = async (e) => {
    e.preventDefault();
    if (!replyContent.trim() || !user) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent,
          author: user.username,
          parentId: comment.id
        })
      });

      if (response.ok) {
        setReplyContent('');
        setShowReplyForm(false);
        if (onReply) onReply();
      }
    } catch (error) {
      console.error('Reply error:', error);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="comment">
      <div className="comment-thread-line"></div>
      <div className="comment-content">
        <div className="comment-meta">
          <span className="comment-author">{comment.author}</span>
          <span className="separator">•</span>
          <span className="comment-time">{timeAgo(comment.createdAt)}</span>
        </div>

        <div className="comment-body">
          <p>{comment.content}</p>
        </div>

        <div className="comment-actions">
          <button className="comment-action">
            <span>▲</span> {comment.score}
          </button>
          {user && (
            <button 
              className="comment-action"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              Reply
            </button>
          )}
        </div>

        {showReplyForm && (
          <form className="reply-form" onSubmit={handleSubmitReply}>
            <textarea
              className="textarea reply-textarea"
              placeholder="What are your thoughts?"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
            />
            <div className="reply-form-actions">
              <button 
                type="button" 
                className="btn btn-ghost"
                onClick={() => setShowReplyForm(false)}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!replyContent.trim() || isSubmitting}
              >
                {isSubmitting ? 'Posting...' : 'Reply'}
              </button>
            </div>
          </form>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map((reply) => (
              <Comment 
                key={reply.id} 
                comment={reply} 
                postId={postId}
                onReply={onReply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Comment;
