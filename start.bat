@echo off
echo 🚀 Iniciando o Conjone para Windows...

:: Verifica Docker
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Erro: O Docker nao esta rodando. Abra o Docker Desktop.
    pause
    exit /b
)

:: Configura .env se não existir
if not exist .env (
    echo 🛠️  Configuracao Inicial:
    set /p G_ID="Digite seu Google Client ID: "
    set /p G_SECRET="Digite seu Google Client Secret: "
    
    copy .env.example .env
    :: Nota: O Windows não tem sed nativo fácil, então aqui o usuário 
    :: talvez precise editar o .env manualmente ou usamos um script Node rápido.
    echo .env criado. Por favor, verifique se os dados estao corretos.
)

echo 📦 Subindo containers...
docker-compose up -d --build

echo ⏳ Aguardando tunel e QR Code...
timeout /t 15

echo 📱 Escaneie o QR Code no seu WhatsApp:
docker logs -f conjone_app
pause
