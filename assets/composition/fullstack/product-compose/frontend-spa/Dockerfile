FROM node:22-alpine AS build
WORKDIR /workspace
COPY . .
RUN npm install && npm run build

FROM nginx:alpine
COPY --from=build /workspace/application/web-app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
