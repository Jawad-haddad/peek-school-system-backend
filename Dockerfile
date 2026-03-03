FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Install dependencies needed for node-gyp and healthchecks
RUN apk add --no-cache python3 make g++ postgresql-client

# Copy package.json and install all dependencies (including devDeps for Prisma CLI)
COPY package*.json ./
RUN npm install

# Copy source code and Prisma schema
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Make entrypoint script executable
RUN chmod +x scripts/entrypoint.sh

# Expose port (can be overridden by docker-compose)
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["scripts/entrypoint.sh"]
