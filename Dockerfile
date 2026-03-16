FROM node:18-alpine

WORKDIR /app

# 复制后端代码
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --production

# 复制所有代码
WORKDIR /app
COPY . .

# 暴露端口
EXPOSE 3000

# 启动服务
WORKDIR /app/backend
CMD ["node", "server.js"]
