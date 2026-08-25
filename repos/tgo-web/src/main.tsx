import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n'; // Initialize i18n
import './utils/debugAuth'; // Initialize debug utilities
import './utils/logoutTest'; // Initialize logout test utilities
import './utils/visitorApiTest'; // Initialize visitor API test utilities
import './utils/visitorPanelTest'; // Initialize visitor panel test utilities
import './utils/markdownTest'; // Initialize markdown test utilities
import './utils/markdownValidation'; // Initialize markdown validation utilities
import './utils/markdownDiagnostics'; // Initialize markdown diagnostics utilities
import './utils/streamMessageTest'; // Initialize stream message test utilities
import App from './App';


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
