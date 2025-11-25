require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { Octokit } = require('@octokit/rest');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;

// GitHub configuration from .env
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH = process.env.DATA_PATH || 'data';

// Validate required environment variables
const requiredEnvVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please check your .env file. See .env.example for required variables.');
  process.exit(1);
}

// Initialize Octokit
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limiting for write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 write requests per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter); // Apply rate limiting to all requests

// ============ GITHUB DATA HELPERS ============

// Get file content from GitHub repo
async function getFileFromGitHub(filePath) {
  try {
    const response = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: filePath,
      ref: GITHUB_BRANCH
    });
    
    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    return {
      content: JSON.parse(content),
      sha: response.data.sha
    };
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

// Create or update file in GitHub repo
async function saveFileToGitHub(filePath, data, message, existingSha = null) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  
  const params = {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: filePath,
    message,
    content,
    branch: GITHUB_BRANCH
  };

  if (existingSha) {
    params.sha = existingSha;
  }

  const response = await octokit.repos.createOrUpdateFileContents(params);
  return response.data;
}

// Get index file
async function getIndex() {
  const result = await getFileFromGitHub(`${DATA_PATH}/index.json`);
  if (!result) {
    // Create initial index if it doesn't exist
    const initialIndex = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      communities: {},
      users: {},
      posts: {}
    };
    await saveFileToGitHub(`${DATA_PATH}/index.json`, initialIndex, 'Initialize Uni-post data index');
    return { content: initialIndex, sha: null };
  }
  return result;
}

// Update index file
async function updateIndex(indexData, sha) {
  indexData.lastUpdated = new Date().toISOString();
  await saveFileToGitHub(`${DATA_PATH}/index.json`, indexData, 'Update Uni-post index', sha);
}

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Uni-post server is running' });
});

// Get index/root data
app.get('/api/index', async (req, res) => {
  try {
    const { content } = await getIndex();
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ USER ROUTES ============

// Register new user
app.post('/api/auth/register', writeLimiter, async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { content: index, sha: indexSha } = await getIndex();
    
    // Check if user exists
    if (index.users[username]) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user data
    const userId = uuidv4();
    const userData = {
      id: userId,
      username,
      email: email || '',
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      karma: 0,
      posts: [],
      comments: [],
      communities: []
    };

    // Save user file to GitHub
    const userFilePath = `${DATA_PATH}/users/${username}.json`;
    await saveFileToGitHub(userFilePath, userData, `Create user: ${username}`);

    // Update index
    index.users[username] = {
      id: userId,
      file: `users/${username}.json`,
      createdAt: userData.createdAt
    };
    await updateIndex(index, indexSha);

    // Return user without password
    const { password: _, ...safeUser } = userData;
    res.status(201).json({ user: safeUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login user
app.post('/api/auth/login', writeLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { content: index } = await getIndex();
    
    if (!index.users[username]) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userFilePath = `${DATA_PATH}/${index.users[username].file}`;
    const userResult = await getFileFromGitHub(userFilePath);

    if (!userResult) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userData = userResult.content;
    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { password: _, ...safeUser } = userData;
    res.json({ user: safeUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile
app.get('/api/u/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { content: index } = await getIndex();

    if (!index.users[username]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userFilePath = `${DATA_PATH}/${index.users[username].file}`;
    const userResult = await getFileFromGitHub(userFilePath);

    if (!userResult) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password: _, ...safeUser } = userResult.content;
    res.json(safeUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COMMUNITY ROUTES ============

// Create community (subreddit)
app.post('/api/r', writeLimiter, async (req, res) => {
  try {
    const { name, description, creator } = req.body;

    if (!name || !creator) {
      return res.status(400).json({ error: 'Community name and creator required' });
    }

    const { content: index, sha: indexSha } = await getIndex();
    const communityName = name.toLowerCase().replace(/[^a-z0-9_]/g, '');

    // Validate sanitized community name
    if (communityName.length < 3) {
      return res.status(400).json({ error: 'Community name must be at least 3 characters after sanitization (only letters, numbers, and underscores allowed)' });
    }

    if (communityName.length > 21) {
      return res.status(400).json({ error: 'Community name cannot exceed 21 characters' });
    }

    if (index.communities[communityName]) {
      return res.status(400).json({ error: 'Community already exists' });
    }

    const communityId = uuidv4();
    const communityData = {
      id: communityId,
      name: communityName,
      displayName: name,
      description: description || '',
      creator,
      createdAt: new Date().toISOString(),
      members: [creator],
      memberCount: 1,
      posts: []
    };

    // Save community file to GitHub
    const communityFilePath = `${DATA_PATH}/communities/${communityName}.json`;
    await saveFileToGitHub(communityFilePath, communityData, `Create community: r/${communityName}`);

    // Update index
    index.communities[communityName] = {
      id: communityId,
      file: `communities/${communityName}.json`,
      createdAt: communityData.createdAt,
      memberCount: 1
    };
    await updateIndex(index, indexSha);

    res.status(201).json(communityData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get community
app.get('/api/r/:community', async (req, res) => {
  try {
    const { community } = req.params;
    const { content: index } = await getIndex();

    if (!index.communities[community]) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const communityFilePath = `${DATA_PATH}/${index.communities[community].file}`;
    const communityResult = await getFileFromGitHub(communityFilePath);

    if (!communityResult) {
      return res.status(404).json({ error: 'Community not found' });
    }

    res.json(communityResult.content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all communities
app.get('/api/communities', async (req, res) => {
  try {
    const { content: index } = await getIndex();
    const communities = [];

    for (const [name, meta] of Object.entries(index.communities)) {
      const communityFilePath = `${DATA_PATH}/${meta.file}`;
      const communityResult = await getFileFromGitHub(communityFilePath);
      if (communityResult) {
        const data = communityResult.content;
        communities.push({
          name: data.name,
          displayName: data.displayName,
          description: data.description,
          memberCount: data.memberCount,
          createdAt: data.createdAt
        });
      }
    }

    res.json(communities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join community
app.post('/api/r/:community/join', writeLimiter, async (req, res) => {
  try {
    const { community } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const { content: index, sha: indexSha } = await getIndex();

    if (!index.communities[community]) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const communityFilePath = `${DATA_PATH}/${index.communities[community].file}`;
    const communityResult = await getFileFromGitHub(communityFilePath);
    const communityData = communityResult.content;

    if (!communityData.members.includes(username)) {
      communityData.members.push(username);
      communityData.memberCount = communityData.members.length;
      await saveFileToGitHub(communityFilePath, communityData, `User ${username} joined r/${community}`, communityResult.sha);

      index.communities[community].memberCount = communityData.memberCount;
      await updateIndex(index, indexSha);
    }

    res.json({ success: true, memberCount: communityData.memberCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ POST ROUTES ============

// Create post
app.post('/api/r/:community/posts', writeLimiter, async (req, res) => {
  try {
    const { community } = req.params;
    const { title, content, author, type = 'text' } = req.body;

    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author required' });
    }

    const { content: index, sha: indexSha } = await getIndex();

    if (!index.communities[community]) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const postId = uuidv4();
    // Add short unique suffix to slug to prevent duplicates
    const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    const postSlug = `${slugBase}_${postId.slice(0, 8)}`;
    const postData = {
      id: postId,
      slug: postSlug,
      title,
      content: content || '',
      type,
      author,
      community,
      createdAt: new Date().toISOString(),
      upvotes: 1,
      downvotes: 0,
      score: 1,
      comments: [],
      commentCount: 0,
      voters: { [author]: 1 }
    };

    // Save post file to GitHub
    const postFilePath = `${DATA_PATH}/posts/${postId}.json`;
    await saveFileToGitHub(postFilePath, postData, `New post in r/${community}: ${title}`);

    // Update community
    const communityFilePath = `${DATA_PATH}/${index.communities[community].file}`;
    const communityResult = await getFileFromGitHub(communityFilePath);
    const communityData = communityResult.content;
    communityData.posts.unshift(postId);
    await saveFileToGitHub(communityFilePath, communityData, `Add post to r/${community}`, communityResult.sha);

    // Update index
    index.posts[postId] = {
      file: `posts/${postId}.json`,
      community,
      author,
      createdAt: postData.createdAt,
      slug: postSlug
    };
    await updateIndex(index, indexSha);

    // Update user's posts
    if (index.users[author]) {
      const userFilePath = `${DATA_PATH}/${index.users[author].file}`;
      const userResult = await getFileFromGitHub(userFilePath);
      if (userResult) {
        const userData = userResult.content;
        userData.posts.unshift(postId);
        await saveFileToGitHub(userFilePath, userData, `User ${author} created post`, userResult.sha);
      }
    }

    res.status(201).json(postData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get post
app.get('/api/r/:community/posts/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { content: index } = await getIndex();

    if (!index.posts[postId]) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
    const postResult = await getFileFromGitHub(postFilePath);

    if (!postResult) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(postResult.content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get posts for community
app.get('/api/r/:community/posts', async (req, res) => {
  try {
    const { community } = req.params;
    const { sort = 'new', limit = 25 } = req.query;
    const { content: index } = await getIndex();

    if (!index.communities[community]) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const communityFilePath = `${DATA_PATH}/${index.communities[community].file}`;
    const communityResult = await getFileFromGitHub(communityFilePath);
    const communityData = communityResult.content;

    const posts = [];
    for (const postId of communityData.posts.slice(0, parseInt(limit))) {
      if (index.posts[postId]) {
        const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
        const postResult = await getFileFromGitHub(postFilePath);
        if (postResult) {
          const { voters, ...safePost } = postResult.content;
          posts.push(safePost);
        }
      }
    }

    // Sort posts
    if (sort === 'hot') {
      posts.sort((a, b) => b.score - a.score);
    } else if (sort === 'top') {
      posts.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
    }

    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all posts (home feed)
app.get('/api/posts', async (req, res) => {
  try {
    const { sort = 'new', limit = 50 } = req.query;
    const { content: index } = await getIndex();

    const posts = [];
    for (const [postId, meta] of Object.entries(index.posts)) {
      const postFilePath = `${DATA_PATH}/${meta.file}`;
      const postResult = await getFileFromGitHub(postFilePath);
      if (postResult) {
        const { voters, ...safePost } = postResult.content;
        posts.push(safePost);
      }
    }

    // Sort posts
    if (sort === 'new') {
      posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'hot') {
      posts.sort((a, b) => b.score - a.score);
    } else if (sort === 'top') {
      posts.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
    }

    res.json(posts.slice(0, parseInt(limit)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vote on post
app.post('/api/posts/:postId/vote', writeLimiter, async (req, res) => {
  try {
    const { postId } = req.params;
    const { username, vote } = req.body; // vote: 1 (upvote), -1 (downvote), 0 (remove vote)

    if (!username || vote === undefined) {
      return res.status(400).json({ error: 'Username and vote required' });
    }

    const { content: index } = await getIndex();

    if (!index.posts[postId]) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
    const postResult = await getFileFromGitHub(postFilePath);
    const postData = postResult.content;

    const previousVote = postData.voters[username] || 0;
    
    // Update vote counts
    if (previousVote === 1) postData.upvotes--;
    if (previousVote === -1) postData.downvotes--;
    
    if (vote === 1) postData.upvotes++;
    if (vote === -1) postData.downvotes++;

    postData.voters[username] = vote;
    postData.score = postData.upvotes - postData.downvotes;

    await saveFileToGitHub(postFilePath, postData, `Vote on post by ${username}`, postResult.sha);

    res.json({ upvotes: postData.upvotes, downvotes: postData.downvotes, score: postData.score });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COMMENT ROUTES ============

// Add comment to post
app.post('/api/posts/:postId/comments', writeLimiter, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, author, parentId = null } = req.body;

    if (!content || !author) {
      return res.status(400).json({ error: 'Content and author required' });
    }

    const { content: index } = await getIndex();

    if (!index.posts[postId]) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
    const postResult = await getFileFromGitHub(postFilePath);
    const postData = postResult.content;

    const commentId = uuidv4();
    const comment = {
      id: commentId,
      content,
      author,
      parentId,
      createdAt: new Date().toISOString(),
      upvotes: 1,
      downvotes: 0,
      score: 1,
      replies: []
    };

    const MAX_NESTING_DEPTH = 10;

    if (parentId) {
      // Find parent comment and add reply with depth limit
      function addReply(comments, depth = 0) {
        if (depth > MAX_NESTING_DEPTH) {
          return false;
        }
        for (const c of comments) {
          if (c.id === parentId) {
            c.replies.push(comment);
            return true;
          }
          if (c.replies && c.replies.length > 0 && addReply(c.replies, depth + 1)) {
            return true;
          }
        }
        return false;
      }
      const found = addReply(postData.comments);
      if (!found) {
        return res.status(404).json({ error: 'Parent comment not found or max nesting depth exceeded' });
      }
    } else {
      postData.comments.push(comment);
    }

    postData.commentCount++;
    await saveFileToGitHub(postFilePath, postData, `Comment by ${author}`, postResult.sha);

    // Update user's comments
    if (index.users[author]) {
      const userFilePath = `${DATA_PATH}/${index.users[author].file}`;
      const userResult = await getFileFromGitHub(userFilePath);
      if (userResult) {
        const userData = userResult.content;
        userData.comments.unshift({ postId, commentId, createdAt: comment.createdAt });
        await saveFileToGitHub(userFilePath, userData, `User ${author} commented`, userResult.sha);
      }
    }

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get comments for post
app.get('/api/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const { content: index } = await getIndex();

    if (!index.posts[postId]) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
    const postResult = await getFileFromGitHub(postFilePath);

    res.json(postResult.content.comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Uni-post server running on port ${PORT}`);
  console.log(`Data stored in GitHub repo: ${GITHUB_OWNER}/${GITHUB_REPO}`);
});

module.exports = app;
