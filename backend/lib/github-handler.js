// ============================================================================
// GitHub Handler — Headless execution engine for GitHub tools
// ============================================================================

let _Octokit;
async function getOctokit(token) {
  if (!_Octokit) {
    const mod = await import('@octokit/rest');
    _Octokit = mod.Octokit;
  }
  return new _Octokit({ auth: token });
}

export async function handleGithubQuery(action, params, token) {
  if (!token) {
    return { error: "No GitHub token provided. The user must authenticate with GitHub first." };
  }

  try {
    const octokit = await getOctokit(token);

    switch (action) {
      case 'list_repos': {
        const { data } = await octokit.repos.listForAuthenticatedUser({ sort: 'updated', per_page: 20 });
        return data.map(r => ({
          owner: r.owner.login,
          name: r.name,
          private: r.private,
          updated_at: r.updated_at,
          description: r.description
        }));
      }
      
      case 'get_tree': {
        const { owner: repoOwner, repo: repoName } = params;
        if (!repoOwner || !repoName) return { error: "Missing owner or repo" };
        
        let defaultBranch = 'main';
        try { 
          defaultBranch = (await octokit.repos.get({ owner: repoOwner, repo: repoName })).data.default_branch; 
        } catch (e) { /* fallback */ }

        // Fetch the latest 5 commits automatically (stolen from audit)
        const { data: commitsData } = await octokit.repos.listCommits({
          owner: repoOwner,
          repo: repoName,
          per_page: 5
        });

        const { data: treeData } = await octokit.git.getTree({ owner: repoOwner, repo: repoName, tree_sha: defaultBranch, recursive: 'true' });
        const skipped = ['node_modules', 'dist', 'build', '.next', '.git', 'venv', '__pycache__', 'coverage', '.cache'];
        
        const maxTreeEntries = 150; // Increased slightly for visibility
        const tree = treeData.tree
          .filter(t => !skipped.some(dir => t.path?.includes(`${dir}/`) || t.path?.startsWith(`${dir}/`)))
          .map(t => ({ path: t.path, type: t.type === 'tree' ? 'directory' : 'file', size: t.size }))
          .slice(0, maxTreeEntries);
          
        return { 
          branch: defaultBranch, 
          totalFiles: treeData.tree.length, 
          tree,
          latestCommits: commitsData.map(c => ({
            sha: c.sha.substring(0, 7),
            message: c.commit.message,
            author: c.commit.author?.name || 'Unknown',
            date: c.commit.author?.date
          }))
        };
      }

      case 'get_commits': {
        const { owner, repo, limit = 10 } = params;
        if (!owner || !repo) return { error: "Missing owner or repo" };

        const { data } = await octokit.repos.listCommits({ owner, repo, per_page: limit });
        return data.map(c => ({
          sha: c.sha,
          author: c.commit.author.name,
          message: c.commit.message,
          date: c.commit.author.date,
          url: c.html_url
        }));
      }

      case 'read_file': {
        const { owner, repo, path } = params;
        if (!owner || !repo || !path) return { error: "Missing owner, repo, or path" };

        const { data } = await octokit.repos.getContent({ owner, repo, path });
        if ('content' in data) {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          return { path, content };
        }
        return { error: "Path is a directory or unsupported file type." };
      }

      default:
        return { error: `Unknown github action: ${action}` };
    }
  } catch (error) {
    console.error(`[GitHub Handler] Error executing ${action}:`, error.message);
    return { error: `Failed to execute ${action}: ${error.message}` };
  }
}
