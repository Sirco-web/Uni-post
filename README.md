# Uni-post

The Open Data Social Platform by Sirco.

Uni-post is a community platform where you own your identity. Unlike other social networks, **Uni-post stores all data directly in a GitHub repository** as open JSON files, ensuring complete transparency and data portability.

## Features

- 🏠 **Communities** - Create and join topic-based groups
- 📝 **Posts** - Share content with rich text and media
- 💬 **Discussions** - Threaded conversations with nested replies
- ⬆️ **Reputation** - Community-driven content curation
- 👤 **User Profiles** - Customize your avatar and bio
- 🛡️ **Moderation** - Community creators become moderators automatically
- 📁 **GitHub Storage** - All data is stored as JSON files in this repo

## How It Works

All data is stored in the `data/` folder of this repository:
- `data/index.json` - Root index that tracks all content locations
- `data/users/` - User profile JSON files
- `data/communities/` - Community JSON files  
- `data/posts/` - Post JSON files with comments

The Node.js server uses the GitHub API to read and write these JSON files directly to the repository.

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   cd client && npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` with:
   - `GITHUB_TOKEN` - A GitHub personal access token with repo permissions
   - `GITHUB_OWNER` - Your GitHub username
   - `GITHUB_REPO` - This repository name (Uni-post)
   - `GITHUB_BRANCH` - The branch to store data (default: main)

5. Start the development server:
   ```bash
   npm run dev
   ```

## URL Structure

- `/` - Home feed
- `/r/:community` - Community page
- `/r/:community/posts/:postId` - Post discussion
- `/u/:username` - User profile
- `/submit` - Create a new post
- `/create-community` - Create a new community
- `/login` - Login page
- `/register` - Registration page

## Tech Stack

- **Frontend**: React, React Router
- **Backend**: Node.js, Express
- **Storage**: GitHub Repository (via GitHub API)
- **Authentication**: bcryptjs for password hashing

## License

Apache 2.0 - See LICENSE file
