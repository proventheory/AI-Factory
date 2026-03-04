/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.BASEPATH,
  experimental: {
    serverComponentsExternalPackages: ['mjml']
  },
  redirects: async () => {
    return [
      // {
      //   source: '/',
      //   destination: '/',
      //   permanent: true,
      //   locale: false
      // },
      {
        source: '/:lang(en|fr|ar)',
        destination: '/',
        permanent: true,
        locale: false
      },
      {
        source: '/((?!(?:en|fr|ar|landing-page|pricing|about-us|careers|blog|favicon.ico)\\b)):path',
        destination: '/en/:path',
        permanent: true,
        locale: false
      }
    ]
  },
  webpack(config) {
    // Add the rule to handle SVGs with @svgr/webpack and file-loader
    config.module.rules.push({
      test: /\.svg$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            svgo: false // Disable SVGO to avoid unexpected transformations
          }
        },
        {
          loader: 'file-loader',
          options: {
            name: '[name].[hash].[ext]',
            outputPath: 'static/images/',
            publicPath: '/_next/static/images/'
          }
        }
      ]
    })

    config.resolve.alias = {
      ...config.resolve.alias,
      "handlebars/runtime": "handlebars/dist/cjs/handlebars.runtime",
      handlebars: "handlebars/dist/cjs/handlebars",
    };

    return config
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: '*',
        port: '',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: 'aimferclcnvhawzpruzn.supabase.co',
        port: '',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: 'aimferclcnvhawzpruzn.supabase.co',
        port: '',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: '*.*',
        port: '',
        pathname: '/**'
      }
    ]
  }
}

export default nextConfig
