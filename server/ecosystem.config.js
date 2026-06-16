module.exports = {
  apps: [
    {
      name: 'marshal-app',
      script: 'app.js',
      cwd: '/var/www/marshal-app/server',
      env_production: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/var/log/marshal-app/error.log',
      out_file: '/var/log/marshal-app/out.log',
    },
  ],
};
