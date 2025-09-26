// Secure CRACO configuration for Replit deployment
module.exports = {
  devServer: {
    allowedHosts: [
      'localhost',
      '.replit.dev', 
      '.replit.co',
      '127.0.0.1',
      '0.0.0.0'
    ],
    host: '0.0.0.0',
    headers: {
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff'
    }
  }
};