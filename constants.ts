import { CategoryItem } from './types';

export const CATEGORIES: CategoryItem[] = [
  { 
    id: 'blusa', 
    label: 'Blusa', 
    image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80',
    span: true,
    badge: 'Popular'
  },
  { 
    id: 'calca', 
    label: 'Calça', 
    image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&q=80',
    span: true,
    badge: 'Essencial'
  },
  { 
    id: 'looks', 
    label: 'Looks Completos', 
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=500&q=80',
    badge: 'Premium'
  },
  { 
    id: 'short', 
    label: 'Short + Bermuda', 
    image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&q=80' 
  },
  { 
    id: 'saia', 
    label: 'Saia + Vestido', 
    image: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=500&q=80',
    badge: 'Novo'
  },
  { 
    id: 'sapatos', 
    label: 'Tênis + Sapatos', 
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&q=80' 
  },
];

export const LOGIN_BG_IMAGES = [
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80",
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80",
  "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&q=80"
];

// Imagens para o primeiro carrossel (5 imagens - Atualizado)
export const HOME_CAROUSEL_1 = [
  "https://i.postimg.cc/pdXYx0zB/TELA.jpg",
  "https://i.postimg.cc/x84TJ14q/TELA-(1).jpg",
  "https://i.postimg.cc/F158BtfB/TELA-(2).jpg",
  "https://i.postimg.cc/7Y9jNRHK/TELA-(3).jpg",
  "https://i.postimg.cc/pRrQV78d/TELA-(4).jpg"
];

// Imagens para o segundo carrossel (4 imagens - Estilo Lifestyle/Close-up)
export const HOME_CAROUSEL_2 = [
  "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&q=80",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80",
  "https://images.unsplash.com/photo-1550614000-4b9519e02a48?w=600&q=80",
  "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=600&q=80"
];

export const BEFORE_AFTER_IMAGES = [
  {
    before: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80",
    after: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80",
    label: "De casual a elegante em segundos"
  },
  {
    before: "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&q=80",
    after: "https://images.unsplash.com/photo-1550614000-4b9519e02a48?w=600&q=80",
    label: "Experimente novas cores e estilos"
  }
];