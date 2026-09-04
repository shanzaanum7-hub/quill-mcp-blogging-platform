import React from 'react';
import ReactDOM from 'react-dom/client';

// Placeholder app — full implementation in Spec 09
function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Quill</h1>
      <p>Foundation scaffold — implementation begins in Spec 09.</p>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in the DOM');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
