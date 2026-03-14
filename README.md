# Pandora AI

Pandora AI é um provador virtual avançado que utiliza Inteligência Artificial para transformar seu estilo em segundos.

## Funcionalidades

- **Autenticação Real:** Login com Email/Senha e Google via Firebase.
- **Provador Virtual:** Experimente roupas em suas próprias fotos usando IA.
- **Geração de Dicas:** Dicas de moda personalizadas geradas pelo Gemini.
- **Histórico de Criações:** Salve e visualize seus looks anteriores.

## Tecnologias Utilizadas

- **Frontend:** React + TypeScript + Tailwind CSS
- **IA:** Google Gemini API (@google/genai)
- **Backend/Auth:** Firebase
- **Ícones:** Lucide React

## Configuração do Projeto

Para rodar este projeto localmente ou subir para o GitHub, siga os passos abaixo:

### 1. Clonar o Repositório
```bash
git clone <url-do-seu-repositorio>
cd pandora-ai
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente
Todas as chaves (Firebase e Gemini) são configuradas através do arquivo `.env`. Como solicitado, o arquivo `.env` **não está sendo ignorado** pelo Git, então as chaves que você colocar nele serão enviadas para o seu repositório.

Crie/edite o arquivo `.env` na raiz do projeto:

```env
GEMINI_API_KEY=sua_chave_gemini
FIREBASE_API_KEY=sua_chave_firebase
FIREBASE_AUTH_DOMAIN=seu_dominio_firebase
FIREBASE_PROJECT_ID=seu_id_projeto
FIREBASE_STORAGE_BUCKET=seu_bucket_storage
FIREBASE_MESSAGING_SENDER_ID=seu_id_sender
FIREBASE_APP_ID=seu_id_app
FIREBASE_MEASUREMENT_ID=seu_id_medicao
```

### 4. Rodar em Desenvolvimento
```bash
npm run dev
```

### 5. Build para Produção
```bash
npm run build
```

## Segurança

**Importante:** Nunca suba seu arquivo `.env` com chaves reais para o GitHub. O projeto já está configurado para usar variáveis de ambiente, garantindo que suas chaves fiquem protegidas.

---
Desenvolvido com ❤️ por Pandora AI Team.
