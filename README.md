# 👗 Pandora AI - Provador Virtual Inteligente

Pandora AI é uma plataforma revolucionária de provador virtual que utiliza Inteligência Artificial de ponta para transformar a experiência de moda. Experimente roupas em suas próprias fotos e receba dicas de estilo personalizadas em segundos.

![Pandora AI Logo](https://i.postimg.cc/G2DYHjrv/P-(1).png)

## ✨ Funcionalidades

- **🔐 Autenticação Segura:** Login social com Google e Email/Senha via Firebase.
- **📸 Provador Virtual (Try-On):** Upload de fotos pessoais para experimentar peças de roupa via IA.
- **💡 Consultoria de Moda:** Dicas de estilo personalizadas geradas pelo Google Gemini.
- **🔄 Visualização 360°:** Geração de múltiplas perspectivas do look.
- **💳 Sistema de Créditos:** Gestão de uso via créditos integrados ao perfil.
- **📱 PWA Ready:** Instale como um aplicativo no seu celular.

## 🚀 Tecnologias

- **Core:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Estilização:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Backend & Auth:** [Firebase](https://firebase.google.com/) (Firestore & Authentication)
- **Inteligência Artificial:** [Google Gemini API](https://ai.google.dev/)
- **Bundler:** [Vite](https://vitejs.dev/)
- **Ícones:** [Lucide React](https://lucide.dev/)

## 🛠️ Configuração e Instalação

Siga os passos abaixo para rodar o projeto em sua máquina local:

### 1. Clonar o Repositório
```bash
git clone https://github.com/seu-usuario/pandora-ai.git
cd pandora-ai
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto e preencha com suas credenciais:

```env
# Google Gemini
GEMINI_API_KEY=sua_chave_aqui

# Firebase Configuration
FIREBASE_API_KEY=sua_chave_aqui
FIREBASE_AUTH_DOMAIN=seu-app.firebaseapp.com
FIREBASE_PROJECT_ID=seu-id-projeto
FIREBASE_STORAGE_BUCKET=seu-app.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=seu-id-sender
FIREBASE_APP_ID=seu-id-app
FIREBASE_MEASUREMENT_ID=seu-id-medicao
FIREBASE_FIRESTORE_DATABASE_ID=(default)
```

### 4. Executar o Projeto
```bash
# Modo Desenvolvimento
npm run dev

# Build para Produção
npm run build
```

## 🛡️ Segurança

Este projeto utiliza variáveis de ambiente para proteger chaves sensíveis. O arquivo `firebase-applet-config.json` e o arquivo `.env` estão no `.gitignore` por padrão. **Nunca suba suas chaves reais para o GitHub.**

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
Desenvolvido com ❤️ pela equipe **Pandora AI**.
