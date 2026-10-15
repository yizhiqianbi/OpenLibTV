import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './features/shared/secondary/styles.css';
import './features/interactive-film/interactive-film.css';
import './features/canvas/batch/storyboard-unlink.css';
import './features/canvas/batch/edge-interaction.css';
createRoot(document.getElementById('root')).render(<App />);
