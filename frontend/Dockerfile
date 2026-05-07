FROM node:22-slim
WORKDIR /app
RUN npm install -g pnpm
COPY frontend/package.json frontend/pnpm-lock.yaml /app/
RUN pnpm install --frozen-lockfile
COPY frontend/ /app/
EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "3000"]