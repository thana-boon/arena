// PM2 config — รัน:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "arena",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3017",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "3017",
      },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
    },
  ],
};
