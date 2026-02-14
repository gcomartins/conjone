#!/bin/bash

# Cores para o terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Iniciando o Conjone - Seu Assistente Soberano${NC}"

# 1. Verifica se o Docker está rodando
if ! docker info > /dev/null 2>&1; then
  echo "❌ Erro: O Docker não está rodando. Inicie o Docker Desktop e tente novamente."
  exit 1
fi

# 2. Configuração Inicial (.env)
if [ ! -f .env ]; then
  echo -e "${BLUE}🛠️  Parece que é sua primeira vez! Vamos configurar o básico:${NC}"
  
  read -p "Digite seu Google Client ID: " G_ID
  read -p "Digite seu Google Client Secret: " G_SECRET
  read -p "Digite sua Gemini API Key (opcional, ou deixe em branco): " G_KEY
  
  cp .env.example .env
  sed -i '' "s/seu_client_id_aqui/$G_ID/g" .env
  sed -i '' "s/seu_client_secret_aqui/$G_SECRET/g" .env
  sed -i '' "s/sua_chave_do_gemini_aqui/$G_KEY/g" .env
fi

# 3. Sobe os containers
echo -e "${BLUE}📦 Subindo os serviços...${NC}"
docker-compose up -d --build

# 4. Captura a URL do Túnel
echo -e "${BLUE}⏳ Aguardando conexão segura...${NC}"
sleep 15
PUBLIC_URL=$(docker logs conjone_tunnel 2>&1 | grep -o 'https://[^ ]*\.trycloudflare.com' | tail -n 1)

if [ -z "$PUBLIC_URL" ]; then
  echo "⚠️  Não consegui gerar a URL automática. Tente reiniciar."
else
  echo -e "${GREEN}✅ Conjone está ONLINE!${NC}"
  echo -e "🔗 URL de Redirecionamento Google: ${GREEN}$PUBLIC_URL/google/callback${NC}"
  echo -e "👉 Importante: Adicione essa URL no seu console do Google Cloud!"
fi

# 5. Mostra o QR Code
echo -e "${BLUE}📱 Escaneie o QR Code abaixo no seu WhatsApp:${NC}"
docker logs -f conjone_app
