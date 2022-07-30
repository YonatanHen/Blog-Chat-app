FROM node:16

WORKDIR C:\Users\yonat\Blog-app\docker

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3005

CMD ["npm", "start"]
