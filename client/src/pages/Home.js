import React, { useState, useEffect } from 'react';
import Post from '../components/Post';
import Sidebar from '../components/Sidebar';
import './Home.css';

function Home() {
  const [posts, setPosts] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('new');

  useEffect(() => {
    fetchPosts();
    fetchCommunities();
  }, [sort]);

  const fetchPosts = async () => {
    try {
      const response = await fetch(`/api/posts?sort=${sort}`);
      if (response.ok) {
        const data = await response.json();
        setPosts(data);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
    setLoading(false);
  };

  const fetchCommunities = async () => {
    try {
      const response = await fetch('/api/communities');
      if (response.ok) {
        const data = await response.json();
        setCommunities(data);
      }
    } catch (error) {
      console.error('Error fetching communities:', error);
    }
  };

  return (
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
            <Post key={post.id} post={post} showCommunity={true} />
          ))
        ) : (
          <div className="empty-state card">
            <h3>No posts yet</h3>
            <p>Be the first to create a post or join a community!</p>
          </div>
        )}
      </div>

      <Sidebar communities={communities} />
    </div>
  );
}

export default Home;
