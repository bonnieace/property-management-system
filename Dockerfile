FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN chmod +x /app/entrypoint.sh \
    && chown -R node:node /app

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http');const p=process.env.PORT||4000;const r=http.get({host:'127.0.0.1',port:p,path:'/ready',timeout:3000},res=>process.exit(res.statusCode===200?0:1));r.on('timeout',()=>{r.destroy();process.exit(1)});r.on('error',()=>process.exit(1));"

ENTRYPOINT ["/app/entrypoint.sh"]
