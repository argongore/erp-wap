module.exports = {
  apps: [
    {
      name: 'erp-wijaya-agro',
      script: './node_modules/.bin/tsx',
      args: 'server.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'Asia/Jakarta',
      },
    },
  ],
};
