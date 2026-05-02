const isGithubPages = process.env.GITHUB_PAGES === "true";
const githubPagesRepo = process.env.GITHUB_PAGES_REPO || "YTPilot";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isGithubPages ? "export" : undefined,
  basePath: isGithubPages ? `/${githubPagesRepo}` : undefined,
  assetPrefix: isGithubPages ? `/${githubPagesRepo}/` : undefined,
  trailingSlash: isGithubPages,
  images: {
    unoptimized: isGithubPages,
  },
};

export default nextConfig;
