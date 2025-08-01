import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Handle .js imports that should resolve to .ts files
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts'],
      '.jsx': ['.jsx', '.tsx'],
    };

    return config;
  },

  // External packages that should not be bundled
  serverExternalPackages: ['@mermaid-js/mermaid-cli'],
};

export default nextConfig;
