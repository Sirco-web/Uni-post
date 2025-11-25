import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Community from './pages/Community';
import PostPage from './pages/PostPage';
import UserProfile from './pages/UserProfile';
import CreatePost from './pages/CreatePost';
import CreateCommunity from './pages/CreateCommunity';
import Login from './pages/Login';
import Register from './pages/Register';
import './styles/App.css';

function App() {
  return (
    <div className="App">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/r/:community" element={<Community />} />
          <Route path="/r/:community/posts/:postId" element={<PostPage />} />
          <Route path="/u/:username" element={<UserProfile />} />
          <Route path="/submit" element={<CreatePost />} />
          <Route path="/r/:community/submit" element={<CreatePost />} />
          <Route path="/create-community" element={<CreateCommunity />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
