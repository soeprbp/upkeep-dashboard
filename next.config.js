/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
}

if (process.env.GITHUB_ACTIONS === 'true') {
  nextConfig.basePath = '/upkeep-dashboard'
  nextConfig.assetPrefix = '/upkeep-dashboard/'
}

module.exports = nextConfig
