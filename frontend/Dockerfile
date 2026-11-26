# Build static assets
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Browser calls same origin; nginx proxies /api → Flask
ARG VITE_API_URL=/api
ARG VITE_COLLEGE_EMAIL_DOMAINS=college.edu
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_COLLEGE_EMAIL_DOMAINS=$VITE_COLLEGE_EMAIL_DOMAINS

RUN npm run build

# Serve with nginx
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
