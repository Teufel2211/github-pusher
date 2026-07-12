import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (React)
app.use(express.static('public'));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.warn('⚠️ GITHUB_TOKEN not set');
}

// GitHub API Helper
async function githubFetch(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API: ${error.message}`);
  }

  return response.json();
}

// API Routes
app.post('/api/github', async (req, res) => {
  const { action, owner, repo, branch, file_path, content, message } = req.body;

  try {
    if (action === 'list_repos') {
      const repos = await githubFetch(`/users/${owner}/repos`);
      return res.json({
        success: true,
        repos: repos.map(r => ({
          name: r.name,
          description: r.description,
          url: r.html_url,
          stars: r.stargazers_count
        }))
      });
    }

    if (action === 'list_branches') {
      const branches = await githubFetch(`/repos/${owner}/${repo}/branches`);
      return res.json({
        success: true,
        branches: branches.map(b => ({
          name: b.name,
          protected: b.protected
        }))
      });
    }

    if (action === 'push_file') {
      if (!owner || !repo || !branch || !file_path || !content || !message) {
        return res.status(400).json({
          success: false,
          error: 'Required: owner, repo, branch, file_path, content, message'
        });
      }

      const base64Content = Buffer.from(content).toString('base64');

      let sha;
      try {
        const checkRes = await githubFetch(
          `/repos/${owner}/${repo}/contents/${file_path}?ref=${branch}`
        );
        sha = checkRes.sha;
      } catch (e) {
        // File doesn't exist
      }

      const pushRes = await githubFetch(
        `/repos/${owner}/${repo}/contents/${file_path}`,
        'PUT',
        {
          message,
          content: base64Content,
          branch,
          ...(sha && { sha })
        }
      );

      return res.json({
        success: true,
        file: pushRes.content.name,
        commit: pushRes.commit.sha,
        url: pushRes.content.html_url
      });
    }

    res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback für React Router
app.get('*', (req, res) => {
  res.sendFile('public/index.html', { root: '.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
