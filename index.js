require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { Octokit } = require('@octokit/rest');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();

// Profanity filter
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'faggot', 'whore', 'slut',
  'bastard', 'dick', 'pussy', 'cock', 'suck', 'porn', 'xxx', 'sex', 'tit', 'boob',
  'penis', 'vagina', 'damn', 'hell', 'piss', 'crap', 'dyke', 'kike', 'chink', 'spic',
  'retard'
];
const hasProfanity = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some(word => lower.includes(word));
};

// Trust reverse proxy headers so express-rate-limit can use X-Forwarded-For
// Set to `true` (trust all proxies) or change to a specific value if needed.
app.set('trust proxy', 1);
console.log('Express trust proxy:', app.get('trust proxy'));

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

// ============ CONFIG & CLEANUP HELPERS ============

async function getConfig() {
  const result = await getFileFromGitHub(`${DATA_PATH}/config.json`);
  if (!result || !result.content || Object.keys(result.content).length === 0) {
    return { retentionDays: 20 }; // Default
  }
  return result.content;
}

async function saveConfig(config, message) {
  await saveFileToGitHub(`${DATA_PATH}/config.json`, config, message);
}

async function deleteFileFromGitHub(filePath, message) {
  try {
    // We need the SHA to delete
    const result = await getFileFromGitHub(filePath);
    if (!result || !result.sha) return;

    await octokit.repos.deleteFile({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: filePath,
      message: message,
      sha: result.sha,
      branch: GITHUB_BRANCH
    });
  } catch (error) {
    console.error(`Failed to delete file ${filePath}:`, error.message);
  }
}

async function cleanupOldPosts() {
  try {
    const config = await getConfig();
    const { content: index, sha: indexSha } = await getIndex();
    const now = new Date();
    const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
    
    let changed = false;
    const postsToDelete = [];

    // Identify posts to delete
    for (const [postId, meta] of Object.entries(index.posts)) {
      const age = now - new Date(meta.createdAt);
      
      // Check if expired
      if (age > retentionMs) {
        // We need to check activity (comments). 
        // Since index doesn't always have comment count in meta (it might, but let's be safe),
        // we rely on the fact that we want to clean up "no activity".
        // If we don't have comment count in index, we might skip or assume 0.
        // However, the createPost route DOES NOT add commentCount to index meta currently.
        // It only adds: file, community, author, createdAt, slug.
        
        // To strictly follow "no activity like commenting", we would need to fetch the post.
        // But fetching every old post is expensive.
        // STRATEGY: If it's old, we fetch it ONCE to check. If inactive, delete.
        
        try {
          const postResult = await getFileFromGitHub(`${DATA_PATH}/${meta.file}`);
          if (postResult && postResult.content) {
            const post = postResult.content;
            if (!post.comments || post.comments.length === 0) {
              postsToDelete.push(postId);
            }
          }
        } catch (err) {
          console.warn(`Could not check post ${postId} for cleanup:`, err.message);
        }
      }
    }

    // Execute deletions (Limit to 5 per run to avoid rate limits)
    for (const postId of postsToDelete.slice(0, 5)) {
      const meta = index.posts[postId];
      if (meta) {
        console.log(`Cleaning up old inactive post: ${postId}`);
        await deleteFileFromGitHub(`${DATA_PATH}/${meta.file}`, `Cleanup: Auto-delete old post ${postId}`);
        delete index.posts[postId];
        
        // Also remove from community list if possible (requires fetching community file, expensive, skipping for now)
        // Ideally we should clean references in users/communities too, but that's very heavy on API.
        // For now, we just remove the file and the index entry.
        
        changed = true;
      }
    }

    if (changed) {
      await updateIndex(index, indexSha);
    }
  } catch (error) {
    console.error('Cleanup job failed:', error);
  }
}

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
app.use(express.json({ limit: '50mb' })); // Increased limit for large files
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
    
    let content;
    // GitHub API returns content for files < 1MB
    if (response.data.content) {
      content = Buffer.from(response.data.content, 'base64').toString('utf8');
    } else if (response.data.sha) {
      // For files > 1MB, content is missing in getContent response, fetch via Blob API
      console.log(`Fetching large file via Blob API: ${filePath}`);
      const blob = await octokit.git.getBlob({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        file_sha: response.data.sha
      });
      content = Buffer.from(blob.data.content, 'base64').toString('utf8');
    }

    if (!content || content.trim() === '') {
      console.warn(`File ${filePath} is empty`);
      return { content: {}, sha: response.data.sha };
    }

    try {
      return {
        content: JSON.parse(content),
        sha: response.data.sha
      };
    } catch (parseError) {
      console.error(`Error parsing JSON for ${filePath}:`, parseError);
      // Return empty object if JSON is corrupt to prevent crash
      return { content: {}, sha: response.data.sha };
    }
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

// Create or update file in GitHub repo
async function saveFileToGitHub(filePath, data, message, existingSha = null) {
  if (data === undefined) {
    throw new Error('Cannot save undefined data');
  }
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
  
  // Initialize default structure if result is null or content is empty/corrupt
  if (!result || !result.content || Object.keys(result.content).length === 0) {
    const initialIndex = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      communities: {},
      users: {},
      posts: {}
    };
    
    const sha = result ? result.sha : null;
    await saveFileToGitHub(`${DATA_PATH}/index.json`, initialIndex, 'Initialize/Repair Uni-post data index', sha);
    return { content: initialIndex, sha: null };
  }

  // Ensure required properties exist to prevent crashes
  if (!result.content.users) result.content.users = {};
  if (!result.content.communities) result.content.communities = {};
  if (!result.content.posts) result.content.posts = {};

  return result;
}

// Update index file
async function updateIndex(indexData, sha) {
  indexData.lastUpdated = new Date().toISOString();
  await saveFileToGitHub(`${DATA_PATH}/index.json`, indexData, 'Update Uni-post index', sha);
}

// Helper for "New Program" direct access
async function getDirectWithFallback(type, id, fallbackFn) {
  // Try direct path first ("New Program")
  // type: 'users', 'communities', 'posts'
  // id: username, communityName, postId
  const path = `${DATA_PATH}/${type}/${id}.json`;
  
  try {
    const result = await getFileFromGitHub(path);
    if (result && result.content && Object.keys(result.content).length > 0) {
      return result;
    }
    throw new Error('Direct fetch returned empty');
  } catch (error) {
    // Fallback to Index ("Old Program")
    console.warn(`
      !!! SYSTEM ALERT !!!
      The new direct-access program failed to find or fetch: ${path}
      Reason: ${error.message}
      
      Falling back to the legacy index.json system.
      This ensures the site stays online even if the direct file structure is unexpected.
    `);
    
    if (fallbackFn) {
      return await fallbackFn();
    }
    throw error;
  }
}

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Uni-post server is running' });
});

app.get('/', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next();
  }
  res.send('Uni-post API Server is running. Access the client at port 3000 in development.');
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

// Get global stats (Unique feature)
app.get('/api/stats', async (req, res) => {
  try {
    const { content: index } = await getIndex();
    res.json({
      users: Object.keys(index.users).length,
      communities: Object.keys(index.communities).length,
      posts: Object.keys(index.posts).length,
      lastUpdated: index.lastUpdated
    });
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

    if (hasProfanity(username)) {
      return res.status(400).json({ error: 'Username contains inappropriate language' });
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
      communities: [],
      avatarUrl: ''
    };

    // Save user file to GitHub
    const userFilePath = `${DATA_PATH}/users/${username}.json`;
    await saveFileToGitHub(userFilePath, userData, `Create user: ${username}`);

    // Update index
    index.users[username] = {
      id: userId,
      file: `users/${username}.json`,
      createdAt: userData.createdAt,
      avatarUrl: ''
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

    if (hasProfanity(username)) {
      return res.status(404).json({ error: 'User not found' });
    }

    // "New Program": Try direct fetch first
    const userResult = await getDirectWithFallback('users', username, async () => {
      // Fallback logic
      const { content: index } = await getIndex();
      if (!index.users[username]) return null;
      const userFilePath = `${DATA_PATH}/${index.users[username].file}`;
      return await getFileFromGitHub(userFilePath);
    });

    if (!userResult) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { content: index } = await getIndex(); // Still need index for cross-referencing avatars
    const { password: _, ...safeUser } = userResult.content;

    // Populate posts with full content
    const populatedPosts = [];
    if (safeUser.posts && safeUser.posts.length > 0) {
      for (const postId of safeUser.posts) {
        if (index.posts[postId]) {
          const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
          const postResult = await getFileFromGitHub(postFilePath);
          if (postResult) {
            const { voters, ...safePost } = postResult.content;
            // Inject avatars/icons
            safePost.authorAvatar = index.users[safePost.author]?.avatarUrl || '';
            safePost.communityIcon = index.communities[safePost.community]?.iconUrl || '';
            populatedPosts.push(safePost);
          }
        }
      }
    }
    safeUser.posts = populatedPosts;

    // Populate comments with content
    const populatedComments = [];
    if (safeUser.comments && safeUser.comments.length > 0) {
      // Limit to last 20 comments to prevent timeouts
      const recentComments = safeUser.comments.slice(0, 20);
      for (const commMeta of recentComments) {
        if (index.posts[commMeta.postId]) {
          const postFilePath = `${DATA_PATH}/${index.posts[commMeta.postId].file}`;
          const postResult = await getFileFromGitHub(postFilePath);
          if (postResult) {
            const post = postResult.content;
            
            // Helper to find comment in tree
            const findComment = (comments) => {
              for (const c of comments) {
                if (c.id === commMeta.commentId) return c;
                if (c.replies && c.replies.length > 0) {
                  const found = findComment(c.replies);
                  if (found) return found;
                }
              }
              return null;
            };

            const foundComment = findComment(post.comments);
            if (foundComment) {
              populatedComments.push({
                ...foundComment,
                postId: post.id,
                postTitle: post.title,
                community: post.community,
                authorAvatar: index.users[foundComment.author]?.avatarUrl || ''
              });
            }
          }
        }
      }
    }
    safeUser.comments = populatedComments;

    res.json(safeUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile (Avatar, About)
app.put('/api/u/:username', writeLimiter, async (req, res) => {
  try {
    const { username } = req.params;
    const { avatarUrl, about } = req.body;

    const { content: index, sha: indexSha } = await getIndex();
    if (!index.users[username]) return res.status(404).json({ error: 'User not found' });

    const userFilePath = `${DATA_PATH}/${index.users[username].file}`;
    const userResult = await getFileFromGitHub(userFilePath);
    const userData = userResult.content;

    if (avatarUrl !== undefined) {
      userData.avatarUrl = avatarUrl;
      // Update index for fast lookup
      index.users[username].avatarUrl = avatarUrl;
    }
    if (about !== undefined) userData.about = about;

    await saveFileToGitHub(userFilePath, userData, `Update profile for ${username}`, userResult.sha);
    if (avatarUrl !== undefined) {
      await updateIndex(index, indexSha);
    }
    
    const { password: _, ...safeUser } = userData;
    res.json(safeUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save/Unsave Post
app.post('/api/users/:username/save/:postId', writeLimiter, async (req, res) => {
  try {
    const { username, postId } = req.params;
    const { content: index } = await getIndex();

    if (!index.users[username]) return res.status(404).json({ error: 'User not found' });
    
    const userFilePath = `${DATA_PATH}/${index.users[username].file}`;
    const userResult = await getFileFromGitHub(userFilePath);
    const userData = userResult.content;

    if (!userData.savedPosts) userData.savedPosts = [];

    const existingIndex = userData.savedPosts.indexOf(postId);
    let saved = false;
    if (existingIndex > -1) {
      userData.savedPosts.splice(existingIndex, 1);
      saved = false;
    } else {
      userData.savedPosts.push(postId);
      saved = true;
    }

    await saveFileToGitHub(userFilePath, userData, `User ${username} ${saved ? 'saved' : 'unsaved'} post ${postId}`, userResult.sha);
    res.json({ saved, savedPosts: userData.savedPosts });
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

    if (hasProfanity(name) || hasProfanity(description)) {
      return res.status(400).json({ error: 'Community name or description contains inappropriate language' });
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
      moderators: [creator], // Creator is automatically a mod
      memberCount: 1,
      posts: [],
      iconUrl: '',
      bannerUrl: ''
    };

    // Save community file to GitHub
    const communityFilePath = `${DATA_PATH}/communities/${communityName}.json`;
    await saveFileToGitHub(communityFilePath, communityData, `Create community: r/${communityName}`);

    // Update index
    index.communities[communityName] = {
      id: communityId,
      file: `communities/${communityName}.json`,
      createdAt: communityData.createdAt,
      memberCount: 1,
      iconUrl: ''
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

    if (hasProfanity(community)) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // "New Program": Try direct fetch first
    const communityResult = await getDirectWithFallback('communities', community, async () => {
      const { content: index } = await getIndex();
      if (!index.communities[community]) return null;
      const communityFilePath = `${DATA_PATH}/${index.communities[community].file}`;
      return await getFileFromGitHub(communityFilePath);
    });

    if (!communityResult) {
      return res.status(404).json({ error: 'Community not found' });
    }

    res.json(communityResult.content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update community (Banner, Icon)
app.put('/api/r/:community', writeLimiter, async (req, res) => {
  try {
    const { community } = req.params;
    const { bannerUrl, iconUrl, description, user } = req.body;

    const { content: index, sha: indexSha } = await getIndex();
    if (!index.communities[community]) return res.status(404).json({ error: 'Community not found' });

    const communityFilePath = `${DATA_PATH}/${index.communities[community].file}`;
    const communityResult = await getFileFromGitHub(communityFilePath);
    const communityData = communityResult.content;

    // Check if user is moderator
    const isMod = communityData.moderators && communityData.moderators.includes(user);
    const isCreator = communityData.creator === user;
    const isAdmin = user === 'timco';

    if (!isMod && !isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Only moderators can edit community' });
    }

    if (bannerUrl !== undefined) communityData.bannerUrl = bannerUrl;
    if (iconUrl !== undefined) {
      communityData.iconUrl = iconUrl;
      index.communities[community].iconUrl = iconUrl;
    }
    if (description !== undefined) communityData.description = description;

    await saveFileToGitHub(communityFilePath, communityData, `Update community r/${community}`, communityResult.sha);
    if (iconUrl !== undefined) {
      await updateIndex(index, indexSha);
    }
    res.json(communityData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete community (Mod/Author)
app.delete('/api/r/:community', writeLimiter, async (req, res) => {
  try {
    const { community } = req.params;
    const { username } = req.body;

    if (username !== 'timco') {
      return res.status(403).json({ error: 'Permission denied. Only super admin can delete communities.' });
    }

    const { content: index, sha: indexSha } = await getIndex();
    if (!index.communities[community]) return res.status(404).json({ error: 'Community not found' });

    // Remove from index
    delete index.communities[community];
    await updateIndex(index, indexSha);

    res.json({ success: true });
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
      if (hasProfanity(name)) continue;

      const communityFilePath = `${DATA_PATH}/${meta.file}`;
      const communityResult = await getFileFromGitHub(communityFilePath);
      if (communityResult) {
        const data = communityResult.content;
        communities.push({
          name: data.name,
          displayName: data.displayName,
          description: data.description,
          memberCount: data.memberCount,
          createdAt: data.createdAt,
          iconUrl: data.iconUrl || meta.iconUrl || ''
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
    
    // "New Program": Try direct fetch first
    const postResult = await getDirectWithFallback('posts', postId, async () => {
      const { content: index } = await getIndex();
      if (!index.posts[postId]) return null;
      const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
      return await getFileFromGitHub(postFilePath);
    });

    if (!postResult) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { content: index } = await getIndex(); // Need index for avatars
    const post = postResult.content;
    // Inject avatars/icons
    post.authorAvatar = index.users[post.author]?.avatarUrl || '';
    post.communityIcon = index.communities[post.community]?.iconUrl || '';

    // Inject avatars into comments
    const injectAvatars = (comments) => {
      return comments.map(c => {
        c.authorAvatar = index.users[c.author]?.avatarUrl || '';
        if (c.replies) c.replies = injectAvatars(c.replies);
        return c;
      });
    };
    if (post.comments) post.comments = injectAvatars(post.comments);

    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete post (Mod/Author)
app.delete('/api/posts/:postId', writeLimiter, async (req, res) => {
  try {
    const { postId } = req.params;
    const { username } = req.body;

    const { content: index } = await getIndex();
    if (!index.posts[postId]) return res.status(404).json({ error: 'Post not found' });

    const postFilePath = `${DATA_PATH}/${index.posts[postId].file}`;
    const postResult = await getFileFromGitHub(postFilePath);
    const postData = postResult.content;

    // Check permissions
    let isAllowed = false;
    if (username === 'timco') {
      isAllowed = true;
    } else if (postData.author === username) {
      isAllowed = true;
    } else {
      // Check if mod
      const communityFilePath = `${DATA_PATH}/${index.communities[postData.community].file}`;
      const communityResult = await getFileFromGitHub(communityFilePath);
      const communityData = communityResult.content;
      if (communityData.moderators && communityData.moderators.includes(username)) {
        isAllowed = true;
      }
    }

    if (!isAllowed) return res.status(403).json({ error: 'Permission denied' });

    // Mark as deleted
    postData.title = '[Deleted by User/Mod]';
    postData.content = '[removed]';
    postData.author = '[deleted]';
    
    await saveFileToGitHub(postFilePath, postData, `Post ${postId} deleted by ${username}`, postResult.sha);
    res.json({ success: true });
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
          // Inject avatars/icons
          safePost.authorAvatar = index.users[safePost.author]?.avatarUrl || '';
          safePost.communityIcon = index.communities[safePost.community]?.iconUrl || '';
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
    // Trigger cleanup occasionally (10% chance) to keep index small
    if (Math.random() < 0.1) {
      cleanupOldPosts().catch(err => console.error('Background cleanup error:', err));
    }

    const { sort = 'new', limit = 50 } = req.query;
    const { content: index } = await getIndex();

    const posts = [];
    for (const [postId, meta] of Object.entries(index.posts)) {
      const postFilePath = `${DATA_PATH}/${meta.file}`;
      const postResult = await getFileFromGitHub(postFilePath);
      if (postResult) {
        const { voters, ...safePost } = postResult.content;
        // Inject avatars/icons from index
        safePost.authorAvatar = index.users[safePost.author]?.avatarUrl || '';
        safePost.communityIcon = index.communities[safePost.community]?.iconUrl || '';
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

// ============ ADMIN ROUTES ============

app.post('/api/admin/config', writeLimiter, async (req, res) => {
  try {
    const { username, retentionDays } = req.body;

    if (username !== 'timco') {
      return res.status(403).json({ error: 'Permission denied. Only super admin can change config.' });
    }

    if (!retentionDays || isNaN(retentionDays)) {
      return res.status(400).json({ error: 'Valid retentionDays required' });
    }

    const config = { retentionDays: parseInt(retentionDays) };
    await saveConfig(config, `Admin ${username} updated retention policy to ${retentionDays} days`);
    
    // Trigger cleanup immediately
    cleanupOldPosts();

    res.json({ success: true, config });
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

    // Inject avatars
    const injectAvatars = (comments) => {
      return comments.map(c => {
        c.authorAvatar = index.users[c.author]?.avatarUrl || '';
        if (c.replies) c.replies = injectAvatars(c.replies);
        return c;
      });
    };
    const comments = injectAvatars(postResult.content.comments);

    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files: prefer production build, fall back to public (avoid ENOENT)
const buildIndex = path.join(__dirname, 'build', 'index.html');
const publicIndex = path.join(__dirname, 'public', 'index.html');

if (fs.existsSync(buildIndex)) {
  app.use(express.static(path.join(__dirname, 'build')));
  // Fallback to build/index.html for client-side routing
  app.get('*', (req, res) => {
    res.sendFile(buildIndex);
  });
} else if (fs.existsSync(publicIndex)) {
  app.use(express.static(path.join(__dirname, 'public')));
  // Fallback to public/index.html for client-side routing
  app.get('*', (req, res) => {
    res.sendFile(publicIndex);
  });
} else {
  console.warn('Warning: no build/ or public/ index.html found. Static files will not be served.');
  console.warn('For development run: npm run client');
  console.warn('To create a production build run: npm run build');
}

app.listen(PORT, () => {
  console.log(`Uni-post server running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('Development mode: Frontend expected on port 3000');
  }
  console.log(`Data stored in GitHub repo: ${GITHUB_OWNER}/${GITHUB_REPO}`);
});

module.exports = app;
