import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Monaco Editor Configuration for AI Studio (Iframe)
// Disables Web Workers to avoid CSP and cross-origin issues
(window as any).MonacoEnvironment = {
  getWorkerUrl: function (_moduleId: any, _label: any) {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
      self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/' };
      importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/base/worker/workerMain.js');
    `)}`;
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);