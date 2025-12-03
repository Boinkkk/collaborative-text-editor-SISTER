FROM node:20-alpine

WORKDIR /app

# Copy package json
COPY package*.json ./

# Install dependencies (akan menginstall tsx juga karena sudah ada di package.json)
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# PERUBAHAN DI SINI: Gunakan 'tsx' bukan 'ts-node'
CMD ["npx", "tsx", "index.ts"]