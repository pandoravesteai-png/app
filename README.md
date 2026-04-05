# 👗 Pandora AI - Sua Estilista Pessoal com Inteligência Artificial

Pandora AI é uma plataforma revolucionária de moda que utiliza Inteligência Artificial avançada para transformar sua experiência com o guarda-roupa. Do provador virtual 360° a dicas de estilo personalizadas, a Pandora AI é sua aliada definitiva no mundo da moda.

## 🚀 Funcionalidades Principais

*   **Provador Virtual (Try-On):** Aplique qualquer peça de roupa em sua foto e veja como fica instantaneamente.
*   **Visualização 360°:** Gere visões de frente, lado e costas de qualquer look.
*   **Consultoria de Estilo:** Receba dicas personalizadas baseadas em tendências e no seu perfil.
*   **Scanner de Ofertas:** Encontre as melhores promoções reais em grandes plataformas (Mercado Livre, Shopee, Shein).
*   **Sistema de Créditos:** Gerencie seus recursos para gerações de IA de alta qualidade.
*   **Gamificação:** Ganhe bônus diários, gire a roleta e abra baús de recompensas.

## 🛠️ Tecnologias Utilizadas

*   **Frontend:** React, TypeScript, Vite, Tailwind CSS, Framer Motion.
*   **Backend:** Node.js, Express (Full-stack setup).
*   **Banco de Dados & Auth:** Firebase (Firestore, Authentication, Storage).
*   **Inteligência Artificial:** Google Gemini API (Vertex AI), Cloud Functions.
*   **Pagamentos:** Integração com AbacatePay (Pix).

## 📋 Pré-requisitos

Antes de começar, você precisará ter instalado:
*   [Node.js](https://nodejs.org/) (v18 ou superior)
*   [Firebase CLI](https://firebase.google.com/docs/cli) (para deploy de functions)

## ⚙️ Configuração

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/seu-usuario/pandora-ai.git
    cd pandora-ai
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    cd functions && npm install && cd ..
    ```

3.  **Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto baseado no `.env.example`:

    ```env
    # Gemini AI
    GEMINI_API_KEY=sua_chave_gemini

    # AbacatePay
    ABACATE_API_KEY=sua_chave_abacatepay

    # Firebase Frontend (Vite)
    VITE_FIREBASE_API_KEY=sua_chave_api
    VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=seu-projeto-id
    VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=seu-sender-id
    VITE_FIREBASE_APP_ID=seu-app-id
    VITE_FIREBASE_MEASUREMENT_ID=seu-measurement-id
    VITE_FIREBASE_VAPID_KEY=sua-chave-vapid
    ```

## 🚀 Deploy

### 1. Cloud Functions (Crucial)
As funções de IA (Try-On, 360 View) rodam no Firebase Cloud Functions. Você **deve** fazer o deploy delas manualmente:

```bash
firebase deploy --only functions --project seu-projeto-id
```

### 2. Frontend & Backend (Cloud Run / Vercel / GitHub Pages)
O projeto está configurado para um ambiente full-stack. Para deploy no GitHub:

1.  Certifique-se de que todas as variáveis `VITE_` estão configuradas no seu provedor de CI/CD.
2.  O comando de build é `npm run build`.
3.  O comando de start é `npm start`.

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
Desenvolvido com ❤️ pela equipe Pandora AI.
